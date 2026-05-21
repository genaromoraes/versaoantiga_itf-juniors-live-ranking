# Pipeline de dados

Esta pasta contem o robo do projeto.

## Arquitetura atual

O cartel historico dos atletas vem da planilha mestre importada para:

- `pipeline/sources/players.json`
- `data/player-points.csv`

Depois disso, o robo frequente nao precisa abrir o breakdown de todos os atletas. Ele so atualiza:

- ranking oficial atual;
- torneios e fases da semana;
- arquivo final `data/latest.json`.

## Comandos

```bash
npm run scrape:ranking
npm run scrape:weekly
npm run build:data
npm run audit:points
npm run validate:data
```

## Importar planilha mestre

```bash
python pipeline/import_points_workbook.py caminho/para/planilha.xlsx
```

O importador espera duas abas:

- `jogadores`
- `cartel_pontos`

## Fontes de verdade

- Pontos historicos: `data/player-points.csv`.
- Atletas acompanhados: `pipeline/sources/players.json`.
- Semana atual: `data/weekly-results.csv`, com possiveis correcoes em `data/manual-weekly-results.csv`.
- Regras de pontos: `pipeline/rules/itf-juniors-2026.json`.

## Arquivos antigos removidos

Os scrapers antigos de points breakdown e activity foram removidos do caminho principal. Eles eram uteis no prototipo, mas hoje poderiam confundir o projeto e sobrescrever a base correta da planilha.
