# ITF Juniors Live Ranking

Site experimental da Info Tenis Brasil para acompanhar ranking ao vivo do tenis juvenil.

## Como funciona

O site usa dois tipos de dados:

- `data.js`: dados de exemplo, usados quando ainda nao existe automacao.
- `data/latest.json`: dados gerados pelo robo de atualizacao.

Quando `data/latest.json` existe, o site usa esse arquivo. Se ele nao existir, o site continua abrindo com os dados de exemplo.

## Colocar no ar

O caminho mais simples e publicar esta pasta como site estatico em Cloudflare Pages, Netlify ou GitHub Pages.

Nao precisa de servidor especial para o site. A parte automatica fica no pipeline de dados.

Em linguagem simples:

- GitHub e a pasta online do projeto.
- Cloudflare Pages, Netlify ou GitHub Pages transformam essa pasta em site.
- GitHub Actions e a rotina automatica que atualiza os dados algumas vezes por dia.

## Atualizacao automatica

O arquivo `.github/workflows/update-ranking.yml` roda 4 vezes por dia no GitHub Actions:

- 08:00
- 12:00
- 16:00
- 20:00

Em linguagem simples: o GitHub abre o robo nesses horarios, coleta os dados da ITF, recalcula o ranking e salva o arquivo `data/latest.json`. Se os dados mudarem, o proprio GitHub publica a atualizacao no site.

## Robo da ITF

Os leitores reais ficam na pasta `pipeline`:

- `scrape-official-ranking.mjs`: le o Top 10 masculino e feminino na pagina oficial de ranking da ITF.
- `data/player-points.csv`: base de pontos historicos dos atletas, uma linha por resultado.
- `data/player-points-status.csv`: relatorio de manutencao da base historica, mostrando quem esta OK e quem precisa de revisao.
- `scrape-player-breakdown.mjs`: le os pontos de simples e duplas no perfil do atleta quando for necessario atualizar a base historica.
- `scrape-player-activity.mjs`: le a atividade recente do atleta para descobrir se esta jogando na semana.
- `build-latest.mjs`: junta tudo e gera o arquivo usado pelo site.

Para rodar localmente no futuro:

```bash
npm install
npx playwright install chromium
npm run scrape:ranking
npm run scrape:activity
npm run build:data
npm run audit:points
```

Para reconstruir a planilha CSV a partir do ultimo JSON de breakdown salvo:

```bash
npm run build:points-csv
```

## Planilha mestre de pontos

A planilha `data/player-points.csv` evita que o robo precise abrir o breakdown completo de todos os atletas toda vez que atualiza o site.

Cada linha representa um resultado de simples ou duplas. As colunas mais importantes sao:

- `player_id`: identificador do atleta.
- `result_type`: `singles` ou `doubles`.
- `event`: torneio.
- `grade`: categoria do torneio.
- `date`: data do resultado.
- `drop_date`: data em que o resultado sai do ranking.
- `points`: pontos cheios do resultado.
- `weight`: peso do resultado; simples vale `1`, duplas vale `0.25`.
- `ranking_points`: pontos efetivos no ranking.
- `source_counting`: `true` quando o resultado esta entre os 6 melhores daquele tipo.

Depois de cada atualizacao, o robo gera `data/player-points-status.csv`. Esse arquivo mostra se a planilha mestre bate com os pontos oficiais da ITF. Quando o status aparecer como `Pendente` ou `Revisar`, aquele atleta precisa ter o breakdown conferido ou preenchido.

## Regras oficiais

As regras-base do ranking juvenil de 2026 foram resumidas em `pipeline/rules/itf-juniors-2026.json`.

Esse arquivo registra a fonte oficial, a formula do ranking, a tabela de pontos e observacoes importantes como bye, walkover, retirement e formatos de draw.
