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

- `scrape-official-ranking.mjs`: le o Top 50 masculino e feminino na pagina oficial de ranking da ITF.
- `data/player-points.csv`: base de pontos historicos dos atletas, uma linha por resultado.
- `data/player-points-status.csv`: relatorio de manutencao da base historica, mostrando quem esta OK e quem precisa de revisao.
- `data/weekly-results.csv`: base semanal para informar torneio, fase atual e status quando a pagina de activity da ITF nao trouxer os dados de forma confiavel.
- `scrape-player-breakdown.mjs`: le os pontos de simples e duplas no perfil do atleta quando for necessario atualizar a base historica.
- `scrape-player-activity.mjs`: le a atividade recente do atleta para descobrir se esta jogando na semana.
- `build-latest.mjs`: junta tudo e gera o arquivo usado pelo site.

Para rodar localmente no futuro:

```bash
npm install
npx playwright install chromium
npm run scrape:ranking
npm run scrape:activity
npm run scrape:weekly
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

Depois de cada atualizacao, o robo gera `data/player-points-status.csv`. Esse arquivo confere a saude da propria planilha mestre: datas de queda, pontos ponderados, quantidade de linhas ativas e se cada atleta tem resultados suficientes. A planilha e a fonte de verdade dos pontos historicos; a comparacao com o total oficial da ITF nao e usada como erro, porque a ITF pode demorar a atualizar.

Para reconstruir a planilha do Top 50 masculino e feminino no GitHub, rode manualmente o workflow `Refresh points table`.

## Resultados da semana

A planilha `data/weekly-results.csv` e uma ponte simples para o live ranking. Ela permite informar, por atleta, qual torneio esta jogando na semana, se esta ativo ou eliminado, e em qual fase esta em simples e duplas.

Colunas:

- `player_id`: identificador do atleta.
- `player_name`: nome do atleta, apenas para leitura humana.
- `match_type`: `Singles` ou `Doubles`.
- `event`: torneio da semana.
- `grade`: categoria do torneio, como `J500`, `J300`, `J200`.
- `start_date` e `end_date`: datas do torneio no formato `aaaa-mm-dd`.
- `status`: `Ativo`, `Eliminado` ou `Nao joga`.
- `current_round`: fase atual ou fase em que foi eliminado, como `R32`, `R16`, `QF`, `SF`, `F`, `W`.
- `source_url`: link da pagina de resultados usada como fonte.
- `notes`: observacoes livres.

Quando essa planilha tiver uma linha para um atleta, ela tem prioridade sobre a leitura automatica da aba Activity. Isso ajuda quando a ITF carrega parte dos dados por JavaScript e o robo nao consegue ler tudo diretamente.

O comando `npm run scrape:weekly` tenta preencher essa planilha automaticamente:

1. abre o calendario juvenil da ITF no mes da semana atual;
2. encontra os torneios da semana;
3. abre a acceptance list de cada torneio;
4. cruza os nomes aceitos com os atletas do ranking acompanhado;
5. escreve os atletas encontrados em `data/weekly-results.csv`.

Nesta fase, a acceptance list serve para descobrir quem esta inscrito. A leitura fina da fase atual ainda depende dos draws/results ou de preenchimento manual da coluna `current_round`.

## Regras oficiais

As regras-base do ranking juvenil de 2026 foram resumidas em `pipeline/rules/itf-juniors-2026.json`.

Esse arquivo registra a fonte oficial, a formula do ranking, a tabela de pontos e observacoes importantes como bye, walkover, retirement e formatos de draw.
