from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pandas as pd


ROOT_DIR = Path(__file__).resolve().parents[1]
SOURCES_FILE = ROOT_DIR / "pipeline" / "sources" / "players.json"
DEFAULT_OUTPUT_XLSX = ROOT_DIR / "data" / "weekly-draw-outsiders.xlsx"
DEFAULT_OUTPUT_CSV = ROOT_DIR / "data" / "weekly-draw-outsiders.csv"


def normalize_text(value) -> str:
    if value is None:
        return ""
    try:
        if pd.isna(value):
            return ""
    except Exception:
        pass
    return str(value).strip()


def normalize_player_id(value) -> str:
    text = normalize_text(value)
    if text.endswith(".0"):
        text = text[:-2]
    if text.lower() in {"", "nan", "none"}:
        return ""
    return text


def infer_gender(player_type_desc, player_type_code) -> tuple[str, str]:
    desc = normalize_text(player_type_desc).lower()
    code = normalize_text(player_type_code).upper()

    if code == "B" or "boys" in desc:
        return "Boys", "Masculino"
    if code == "G" or "girls" in desc:
        return "Girls", "Feminino"
    return "", ""


def build_profile_url(value) -> str:
    profile = normalize_text(value)
    if not profile:
        return ""
    if profile.startswith("http"):
        return profile
    return f"https://www.itftennis.com{profile}"


def numeric_itf_id_from_url(url: str) -> str:
    match = re.search(r"/players/[^/]+/([^/]+)/", normalize_text(url))
    return match.group(1) if match else ""


def load_current_sources() -> tuple[list[dict], set[tuple[str, str]]]:
    players = json.loads(SOURCES_FILE.read_text(encoding="utf-8"))
    indexed: set[tuple[str, str]] = set()

    for player in players:
        numeric_id = numeric_itf_id_from_url(player.get("pointsBreakdownUrl", ""))
        gender = normalize_text(player.get("gender"))
        if numeric_id and gender:
            indexed.add((gender, numeric_id))

    return players, indexed


def add_draw_player(bucket: dict, row: dict, team_number: int, player_number: int) -> None:
    player_id = normalize_player_id(row.get(f"team{team_number}_player{player_number}_id"))
    if not player_id:
        return

    player_name = normalize_text(row.get(f"team{team_number}_player{player_number}_name"))
    nationality = normalize_text(row.get(f"team{team_number}_player{player_number}_nationality"))
    profile_url = build_profile_url(row.get(f"team{team_number}_player{player_number}_profile"))
    gender, gender_label = infer_gender(row.get("playerTypeDesc"), row.get("playerTypeCode"))

    if not gender:
        return

    key = (gender, player_id)
    if key not in bucket:
        bucket[key] = {
            "gender": gender,
            "gender_label": gender_label,
            "player_id": player_id,
            "player_name": player_name,
            "country_code": nationality,
            "profile_url": profile_url,
            "points_breakdown_url": profile_url.rstrip("/") + "/itf-points-breakdown/" if profile_url else "",
            "source_tournaments": set(),
        }

    tournament_name = normalize_text(row.get("tournamentName"))
    if tournament_name:
        bucket[key]["source_tournaments"].add(tournament_name)

    if player_name and not bucket[key]["player_name"]:
        bucket[key]["player_name"] = player_name
    if nationality and not bucket[key]["country_code"]:
        bucket[key]["country_code"] = nationality
    if profile_url and not bucket[key]["profile_url"]:
        bucket[key]["profile_url"] = profile_url
        bucket[key]["points_breakdown_url"] = profile_url.rstrip("/") + "/itf-points-breakdown/"


def extract_draw_players(draws_df: pd.DataFrame) -> pd.DataFrame:
    players: dict[tuple[str, str], dict] = {}

    for _, row in draws_df.iterrows():
        row_dict = row.to_dict()
        add_draw_player(players, row_dict, 1, 1)
        add_draw_player(players, row_dict, 1, 2)
        add_draw_player(players, row_dict, 2, 1)
        add_draw_player(players, row_dict, 2, 2)

    rows = []
    for data in players.values():
        rows.append(
            {
                **data,
                "source_tournaments": " | ".join(sorted(data["source_tournaments"])),
            }
        )

    if not rows:
        return pd.DataFrame()

    return pd.DataFrame(rows).sort_values(by=["gender", "player_name", "player_id"]).reset_index(drop=True)


def detect_outsiders(draw_players_df: pd.DataFrame, indexed_players: set[tuple[str, str]]) -> pd.DataFrame:
    if draw_players_df.empty:
        return pd.DataFrame()

    missing = draw_players_df[
        ~draw_players_df.apply(
            lambda row: (normalize_text(row.get("gender")), normalize_player_id(row.get("player_id"))) in indexed_players,
            axis=1,
        )
    ].copy()

    if missing.empty:
        return missing

    return missing.sort_values(by=["gender", "player_name", "player_id"]).reset_index(drop=True)


def write_outputs(draw_players_df: pd.DataFrame, outsiders_df: pd.DataFrame, output_xlsx: Path, output_csv: Path) -> None:
    output_xlsx.parent.mkdir(parents=True, exist_ok=True)
    outsiders_df.to_csv(output_csv, index=False, encoding="utf-8-sig")

    with pd.ExcelWriter(output_xlsx) as writer:
        draw_players_df.to_excel(writer, sheet_name="jogadores_dos_draws", index=False)
        outsiders_df.to_excel(writer, sheet_name="fora_da_base", index=False)


def main() -> int:
    if len(sys.argv) < 2:
        print("Uso: python pipeline/detect-weekly-draw-outsiders.py <caminho-da-planilha-dos-draws.xlsx>")
        return 1

    draws_file = Path(sys.argv[1]).expanduser().resolve()
    if not draws_file.exists():
        print(f"Arquivo não encontrado: {draws_file}")
        return 1

    output_xlsx = Path(sys.argv[2]).expanduser().resolve() if len(sys.argv) >= 3 else DEFAULT_OUTPUT_XLSX
    output_csv = output_xlsx.with_suffix(".csv")

    draws_df = pd.read_excel(draws_file, sheet_name="partidas")
    _, indexed_players = load_current_sources()
    draw_players_df = extract_draw_players(draws_df)
    outsiders_df = detect_outsiders(draw_players_df, indexed_players)
    write_outputs(draw_players_df, outsiders_df, output_xlsx, output_csv)

    summary = {
        "drawWorkbook": str(draws_file),
        "drawPlayersFound": int(len(draw_players_df)),
        "outsidersFound": int(len(outsiders_df)),
        "boysOutsiders": int((outsiders_df["gender"] == "Boys").sum()) if not outsiders_df.empty else 0,
        "girlsOutsiders": int((outsiders_df["gender"] == "Girls").sum()) if not outsiders_df.empty else 0,
        "outputWorkbook": str(output_xlsx),
        "outputCsv": str(output_csv),
    }

    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
