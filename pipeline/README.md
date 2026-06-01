# Pipeline de dados

Esta pasta contem o robo do projeto.

## Arquitetura atual

O cartel historico dos atletas pode nascer da planilha mestre, mas no fluxo oficial ele eh atualizado pela propria ITF:

- `pipeline/sources/players.json`
- `data/player-points.csv`

Depois disso, o robo frequente nao precisa abrir o breakdown de todos os atletas. Ele so atualiza:

- torneios e fases da semana;
- jogadores da semana que ainda estao fora da base;
- arquivo final `data/latest.json`.

Hoje o fluxo esta dividido assim:

- workflow leve: reutiliza a lista de torneios da semana ja descoberta e atualiza apenas draws/resultados/fases;
- workflow completo: atualiza ranking oficial, atualiza o cartel de pontos pela API de breakdown da ITF, redescobre o calendario da semana e faz a manutencao mais pesada.

O workflow leve tambem sabe antecipar a virada da semana:

- se todos os torneios salvos no preview atual ja estiverem encerrados;
- e nao houver mais atletas ativos em simples ou duplas;

entao ele libera uma atualizacao que ja troca o preview para a semana seguinte e passa a acompanhar os novos torneios.

## Comandos

```bash
npm run scrape:ranking
npm run scrape:points
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

- Pontos historicos: `data/player-points.csv`, atualizado por `npm run scrape:points` no workflow completo.
- Atletas acompanhados: `pipeline/sources/players.json`.
- Semana atual: `data/weekly-results.csv`, com possiveis correcoes em `data/manual-weekly-results.csv`.
- Semanas encerradas aguardando incorporacao na base oficial: `data/weekly-results-history.csv`.
- Radar de fora da base: `data/weekly-outsiders.csv` e `data/weekly-outsiders-preview.json`.
- Regras de pontos: `pipeline/rules/itf-juniors-2026.json`.

## Outsiders da semana

O radar de jogadores fora da base principal agora ja eh gerado pelo proprio:

- `pipeline/scrape-weekly-results.mjs`

Nao existe mais necessidade de um script separado so para detectar outsiders a partir dos draws.

## Arquivos antigos removidos

Os scrapers antigos de activity foram removidos do caminho principal. O breakdown de pontos voltou ao fluxo principal, mas agora centralizado em `pipeline/scrape-player-points.mjs` e usando somente a API da ITF.
