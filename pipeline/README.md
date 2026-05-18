# Pipeline de dados

Esta pasta e o "robo" do projeto.

Em linguagem simples: o site mostra dados; o pipeline prepara os dados.

## O que existe agora

`build-latest.mjs` gera `data/latest.json` no formato que o site ja sabe ler.

Hoje ele ainda usa os dados simulados de `data.js`. O proximo passo e substituir essa origem por dados lidos das paginas da ITF:

- Ranking oficial: pagina de ranking juvenil da ITF
- Points breakdown: perfil do atleta na aba de pontos
- Activity: perfil do atleta na aba de atividade
- Draws and results: pagina do torneio da semana

## Como rodar

```bash
npm run build:data
```

Depois disso, o site passa a usar `data/latest.json` quando estiver aberto por um servidor local ou publicado na web.

## Primeiro robô real

O comando abaixo abre a pagina de points breakdown de um atleta da ITF e gera uma previa em `data/itf-player-preview.json`:

```bash
npm run scrape:player
```

Nesta primeira fase ele esta configurado para Luis Guto Miguel em `pipeline/sources/players.json`.
Depois que validarmos a leitura com 1 atleta, expandimos para Top 100 masculino e Top 100 feminino.

## Frequencia

A automacao esta pensada para rodar 4 vezes por dia. Isso e suficiente para um MVP e ajuda a reduzir acessos desnecessarios as paginas da ITF.

## Formato esperado

```json
{
  "dataSource": {
    "rankingDate": "11 mai 2026",
    "updatedAt": "17/05/2026, 20:30",
    "note": "Pontos = ..."
  },
  "players": []
}
```

Cada atleta precisa ter:

- `id`, `name`, `country`, `gender`, `currentRank`
- `singles`: resultados das ultimas 52 semanas
- `doubles`: resultados das ultimas 52 semanas
- `defending`: pontos caindo nesta semana
- `liveEvent`: torneio e fase desta semana
