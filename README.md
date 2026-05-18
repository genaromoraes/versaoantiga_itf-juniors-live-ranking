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

O arquivo `.github/workflows/update-ranking.yml` esta preparado para rodar 4 vezes por dia no GitHub Actions:

- 09:00
- 13:00
- 17:00
- 21:00

Hoje ele gera `data/latest.json` a partir dos dados simulados. O proximo passo e trocar a origem simulada pelas paginas reais da ITF.

## Robo da ITF

O primeiro leitor real ja esta em `pipeline/scrape-player-breakdown.mjs`.

Ele abre a pagina de points breakdown de um atleta, le os resultados de simples e duplas e gera uma previa em JSON. Esta fase ainda e de validacao com poucos atletas antes de ligar no ranking publicado.

Para rodar localmente no futuro:

```bash
npm install
npm run scrape:player
```

## Regras oficiais

As regras-base do ranking juvenil de 2026 foram resumidas em `pipeline/rules/itf-juniors-2026.json`.

Esse arquivo registra a fonte oficial, a formula do ranking, a tabela de pontos e observacoes importantes como bye, walkover, retirement e formatos de draw.
