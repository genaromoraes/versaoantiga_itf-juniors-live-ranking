from __future__ import annotations

import csv
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd


ROOT_DIR = Path(__file__).resolve().parents[1]
SOURCES_FILE = ROOT_DIR / "pipeline" / "sources" / "players.json"
POINTS_CSV_FILE = ROOT_DIR / "data" / "player-points.csv"
PREVIEW_FILE = ROOT_DIR / "data" / "itf-player-preview.json"


def slugify(value: str) -> str:
    text = (value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    text = re.sub(r"-{2,}", "-", text)
    return text.strip("-")


def parse_iso_date(value: str) -> str:
    text = str(value or "").strip()
    if not text:
        return ""

    for fmt in ("%d %b %Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue

    return text


def add_drop_date(date_value: str) -> str:
    if not date_value:
        return ""
    try:
        date = datetime.strptime(date_value, "%Y-%m-%d").date()
    except ValueError:
        return ""
    return (date + timedelta(days=364)).isoformat()


def parse_bool_countable(value: str) -> bool:
    text = str(value or "").strip().lower()
    if text in {"countable", "true", "1", "yes", "sim"}:
        return True
    if text in {"non-countable", "false", "0", "no", "nao", "não"}:
        return False
    return True


def gender_label(value: str) -> str:
    text = str(value or "").strip().lower()
    return "Girls" if text == "girls" else "Boys"


def player_slug(row: dict) -> str:
    url = str(row.get("profile_url") or row.get("points_breakdown_url") or "").strip()
    match = re.search(r"/players/([^/]+)/\d+/", url)
    if match:
        return match.group(1)
    return slugify(str(row.get("player") or ""))


def float_value(value) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


@dataclass
class ImportedPlayer:
    id: str
    name: str
    country: str
    gender: str
    current_rank: int
    official_points: float
    points_breakdown_url: str


def build_sources(players_df: pd.DataFrame) -> list[dict]:
    players = []
    for row in players_df.fillna("").to_dict(orient="records"):
        imported = ImportedPlayer(
            id=player_slug(row),
            name=str(row.get("player") or "").strip(),
            country=str(row.get("country_code") or "").strip(),
            gender=gender_label(row.get("gender")),
            current_rank=int(float_value(row.get("rank"))),
            official_points=float_value(row.get("ranking_points_total")),
            points_breakdown_url=str(row.get("points_breakdown_url") or "").strip(),
        )
        players.append(
            {
                "currentRank": imported.current_rank,
                "name": imported.name,
                "country": imported.country,
                "gender": imported.gender,
                "id": imported.id,
                "officialPoints": imported.official_points,
                "pointsBreakdownUrl": imported.points_breakdown_url,
                "needsProfileResolution": not bool(imported.points_breakdown_url),
            }
        )

    return sorted(players, key=lambda item: (item["gender"], item["currentRank"]))


def build_numeric_player_map(players_df: pd.DataFrame) -> dict[str, dict]:
    players_by_numeric_id: dict[str, dict] = {}

    for row in players_df.fillna("").to_dict(orient="records"):
        numeric_id = str(row.get("player_id") or "").strip()
        if not numeric_id:
            continue

        players_by_numeric_id[numeric_id] = {
            "currentRank": int(float_value(row.get("rank"))),
            "name": str(row.get("player") or "").strip(),
            "country": str(row.get("country_code") or "").strip(),
            "gender": gender_label(row.get("gender")),
            "id": player_slug(row),
            "officialPoints": float_value(row.get("ranking_points_total")),
            "pointsBreakdownUrl": str(row.get("points_breakdown_url") or "").strip(),
            "needsProfileResolution": not bool(str(row.get("points_breakdown_url") or "").strip()),
        }

    return players_by_numeric_id


def build_points_rows(cartel_df: pd.DataFrame, players_by_numeric_id: dict[str, dict]) -> list[list[str]]:
    headers = [
        "player_id",
        "player_name",
        "country",
        "gender",
        "current_rank",
        "source_url",
        "result_type",
        "event",
        "grade",
        "date",
        "drop_date",
        "points",
        "weight",
        "ranking_points",
        "source_counting",
    ]

    rows: list[list[str]] = [headers]

    for row in cartel_df.fillna("").to_dict(orient="records"):
        numeric_id = str(row.get("player_id") or "").strip()
        source_player = players_by_numeric_id.get(numeric_id)
        if not source_player:
            continue

        result_type = str(row.get("event_type") or "").strip().lower()
        if result_type not in {"singles", "doubles"}:
            continue

        date_iso = parse_iso_date(row.get("startDate"))
        drop_date = add_drop_date(date_iso)
        points = float_value(row.get("points"))
        weight = 0.25 if result_type == "doubles" else 1
        ranking_points = points * weight

        rows.append(
            [
                source_player["id"],
                source_player["name"],
                source_player["country"],
                source_player["gender"],
                str(source_player["currentRank"]),
                source_player["pointsBreakdownUrl"],
                result_type,
                str(row.get("tournamentName") or "").strip(),
                str(row.get("category") or "").strip(),
                date_iso,
                drop_date,
                f"{points:g}",
                f"{weight:g}",
                f"{ranking_points:g}",
                "true" if parse_bool_countable(row.get("countable_status")) else "false",
            ]
        )

    return rows


def build_preview(cartel_df: pd.DataFrame, players_by_numeric_id: dict[str, dict]) -> dict:
    grouped: dict[str, dict] = {}

    for row in cartel_df.fillna("").to_dict(orient="records"):
        numeric_id = str(row.get("player_id") or "").strip()
        source_player = players_by_numeric_id.get(numeric_id)
        if not source_player:
            continue

        player = grouped.setdefault(
            source_player["id"],
            {
                "id": source_player["id"],
                "name": source_player["name"],
                "country": source_player["country"],
                "gender": source_player["gender"],
                "currentRank": source_player["currentRank"],
                "sourceUrl": source_player["pointsBreakdownUrl"],
                "totalCombinedPoints": float_value(source_player["officialPoints"]),
                "singles": [],
                "doubles": [],
            },
        )

        result_type = str(row.get("event_type") or "").strip().lower()
        target = "doubles" if result_type == "doubles" else "singles"
        date_iso = parse_iso_date(row.get("startDate"))
        player[target].append(
            {
                "event": str(row.get("tournamentName") or "").strip(),
                "date": date_iso,
                "dropDate": add_drop_date(date_iso),
                "grade": str(row.get("category") or "").strip(),
                "country": str(row.get("hostNation") or "").strip(),
                "surface": str(row.get("surfaceDesc") or "").strip(),
                "round": str(row.get("round") or "").strip(),
                "draw": str(row.get("drawType") or "").strip(),
                "points": float_value(row.get("points")),
                "sourceCounting": parse_bool_countable(row.get("countable_status")),
            }
        )

    timestamp = datetime.now(timezone.utc).astimezone().strftime("%d/%m/%Y, %H:%M")
    return {
        "players": sorted(grouped.values(), key=lambda item: (item["gender"], item["currentRank"])),
        "importedFromWorkbook": True,
        "importedAt": timestamp,
    }


def write_csv(rows: list[list[str]], output_file: Path) -> None:
    output_file.parent.mkdir(parents=True, exist_ok=True)
    with output_file.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, quoting=csv.QUOTE_ALL)
        writer.writerows(rows)


def main() -> int:
    if len(sys.argv) < 2:
        print("Uso: python pipeline/import_top50_workbook.py <caminho-da-planilha.xlsx>")
        return 1

    workbook = Path(sys.argv[1]).expanduser().resolve()
    if not workbook.exists():
        print(f"Arquivo não encontrado: {workbook}")
        return 1

    players_df = pd.read_excel(workbook, sheet_name="jogadores")
    cartel_df = pd.read_excel(workbook, sheet_name="cartel_pontos")

    players_by_numeric_id = build_numeric_player_map(players_df)
    sources = sorted(players_by_numeric_id.values(), key=lambda item: (item["gender"], item["currentRank"]))
    points_rows = build_points_rows(cartel_df, players_by_numeric_id)
    preview = build_preview(cartel_df, players_by_numeric_id)

    SOURCES_FILE.parent.mkdir(parents=True, exist_ok=True)
    SOURCES_FILE.write_text(f"{json.dumps(sources, ensure_ascii=False, indent=2)}\n", encoding="utf-8")
    write_csv(points_rows, POINTS_CSV_FILE)
    PREVIEW_FILE.parent.mkdir(parents=True, exist_ok=True)
    PREVIEW_FILE.write_text(f"{json.dumps(preview, ensure_ascii=False, indent=2)}\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "workbook": str(workbook),
                "playersImported": len(sources),
                "pointRowsImported": len(points_rows) - 1,
                "sourcesFile": str(SOURCES_FILE),
                "pointsCsvFile": str(POINTS_CSV_FILE),
                "previewFile": str(PREVIEW_FILE),
            },
            ensure_ascii=False,
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
