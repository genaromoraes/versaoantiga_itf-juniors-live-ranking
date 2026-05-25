# ITF Juniors Live Ranking

Site experimental da Info Tenis Brasil para acompanhar o ranking ao vivo do tenis juvenil.

## Fonte principal

A fonte historica do projeto agora e a planilha/cartel de pontos dos atletas acompanhados.

No site publicado, essa base aparece em:

- `pipeline/sources/players.json`: lista oficial dos atletas acompanhados.
- `data/player-points.csv`: cartel completo de pontos de cada atleta.
- `data/latest.json`: arquivo final consumido pelo site.

O calculo do ranking usa:

- 6 melhores resultados de simples.
- 25% dos 6 melhores resultados de duplas.
- Datas de queda (`drop_date`) salvas no cartel de pontos.
- Resultados da semana em `data/weekly-results.csv`.

## Atualizacao do site

O site e estatico. O navegador le `data/latest.json` e renderiza a tabela.

Para atualizar a pagina publicada:

- Mudanca visual em `app.js`, `index.html` ou `styles.css`: basta fazer push no GitHub.
- Mudanca em dados ja gerados (`data/latest.json`, `data/player-points.csv`, etc.): basta fazer push no GitHub.
- Atualizacao leve da semana: workflow `Update live weekly data`.
- Atualizacao completa da base/ranking oficial: workflow `Update ranking data`.

Nao existe mais workflow para reconstruir o cartel historico pela ITF. Quando a base historica mudar, importe uma nova planilha mestre.

## Robos atuais

Scripts ainda usados:

- `pipeline/import_points_workbook.py`: importa a planilha mestre e recria `players.json` e `player-points.csv`.
- `pipeline/scrape-official-ranking.mjs`: atualiza ranking oficial, posicoes e links dos atletas acompanhados.
- `pipeline/scrape-weekly-results.mjs`: busca torneios/resultados da semana.
- `pipeline/build-latest.mjs`: junta cartel historico + ranking oficial + semana atual e gera `data/latest.json`.
- `pipeline/audit-player-points.mjs`: confere a saude do cartel de pontos.
- `pipeline/validate-latest.mjs`: valida se o `latest.json` esta publicavel.

## Como importar uma nova planilha

Exemplo local:

```bash
python pipeline/import_points_workbook.py caminho/para/itf_juniors_top150_completo.xlsx
npm run build:data
npm run audit:points
npm run validate:data
```

A planilha precisa ter as abas:

- `jogadores`
- `cartel_pontos`

## Workflows atuais

### 1. Workflow leve da semana

O workflow `.github/workflows/update-live-weekly.yml` tenta iniciar a cada 10 minutos:

- 07
- 17
- 27
- 37
- 47
- 57

Mas ele so executa de verdade quando a ultima atualizacao ja tem pelo menos 30 minutos. Isso foi feito para contornar atrasos do scheduler do GitHub.

Ele faz:

1. Reaproveita a lista de torneios da semana ja salva em `data/weekly-tournaments-preview.json`.
2. Atualiza apenas draws/resultados/fases desses torneios.
3. Atualiza o radar de outsiders da semana.
4. Recalcula `data/latest.json`.
5. Valida e publica os dados leves.

Ele nao raspa o ranking oficial inteiro da ITF e nao redescobre o calendario completo da semana em toda execucao.

Quando todos os torneios da semana atual ja estiverem encerrados e sem atletas ainda ativos, ele pode antecipar a virada:

1. Detecta que a semana atual terminou.
2. Autoriza uma execucao fora da janela normal de 30 minutos, se necessario.
3. Atualiza a lista de torneios para a semana seguinte.
4. Passa a acompanhar os draws da nova semana nas proximas rodadas leves.

### 2. Workflow completo

O workflow `.github/workflows/update-ranking.yml` roda 4 vezes por dia:

- 08:00
- 12:00
- 16:00
- 20:00

Ele faz:

1. Atualiza ranking oficial dos atletas acompanhados.
2. Redescobre os torneios da semana no calendario da ITF.
3. Atualiza resultados da semana.
4. Recalcula `data/latest.json`.
5. Audita o cartel de pontos.
6. Valida e publica os dados.

## Arquivos de dados

- `data/player-points.csv`: fonte historica principal.
- `data/weekly-results.csv`: resultados da semana.
- `data/weekly-results-history.csv`: resultados de semanas encerradas ja incorporados ao cartel local.
- `data/manual-weekly-results.csv`: correcoes manuais, quando necessario.
- `data/itf-ranking-preview.json`: ultima leitura do ranking oficial.
- `data/weekly-tournaments-preview.json`: diagnostico da leitura semanal.
- `data/weekly-outsiders.csv`: jogadores da semana ainda fora da base principal.
- `data/weekly-outsiders-preview.json`: preview resumido dos outsiders encontrados.
- `data/player-points-status.csv`: auditoria da planilha/cartel.
- `data/latest.json`: arquivo final usado pelo site.

## Regras oficiais

As regras-base ficam em `pipeline/rules/itf-juniors-2026.json`, incluindo tabela de pontos de simples e duplas.
