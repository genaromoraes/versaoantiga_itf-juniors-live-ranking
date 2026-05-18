# Pipeline de dados

Esta pasta e o "robo" do projeto.

Em linguagem simples: o site mostra dados; o pipeline prepara os dados.

## O que existe agora

`build-latest.mjs` gera `data/latest.json` no formato que o site ja sabe ler.

Quando existem arquivos reais em `data/itf-player-preview.json` e `data/itf-activity-preview.json`, ele substitui os dados simulados pelos dados lidos nas paginas da ITF:

- Ranking oficial: pagina de ranking juvenil da ITF
- Points breakdown: perfil do atleta na aba de pontos
- Activity: perfil do atleta na aba de atividade
- Draws and results: pagina do torneio da semana

O primeiro passo da automacao e `scrape-official-ranking.mjs`. Ele atualiza `pipeline/sources/players.json` com o Top 10 masculino e o Top 10 feminino oficiais antes dos outros leitores rodarem.

A base de pontos historicos fica em `data/player-points.csv`. Essa base evita abrir o `points breakdown` de todos os atletas em toda atualizacao. O robô usa essa planilha como fonte principal dos pontos e consulta com frequencia apenas a pagina de ranking oficial e a aba Activity dos atletas.

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

## Primeiro leitor de torneio

O comando abaixo abre uma pagina de draws and results e gera uma previa em `data/itf-tournament-preview.json`:

```bash
npm run scrape:tournament
```

Nesta primeira fase ele extrai metadados do torneio e a lista textual de jogadores no draw. O passo seguinte e usar essa lista para identificar automaticamente se um atleta esta jogando e qual foi sua fase.

## Leitor de atividade do atleta

O comando abaixo abre a aba Activity de um atleta e gera `data/itf-activity-preview.json`:

```bash
npm run scrape:activity
```

Essa pagina e a ponte mais importante entre atleta e torneio da semana, porque mostra torneio, fase, resultado e BYE.

## Frequencia

A automacao roda 4 vezes por dia: 08:00, 12:00, 16:00 e 20:00 no horario de Brasilia. Isso e suficiente para um MVP e ajuda a reduzir acessos desnecessarios as paginas da ITF.

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
