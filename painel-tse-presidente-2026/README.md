# Painel web de apuração — Presidente 2026

Site estático, mobile-first, que lê diretamente no navegador os arquivos JSON públicos do TSE para a eleição presidencial de 2026. Não usa backend, banco de dados, projeções ou estimativas.

## Estrutura

```text
painel-tse-presidente-2026/
├── index.html
├── app.js
├── styles.css
├── tests.html
├── tests.js
└── README.md
```

## Fonte oficial

Base do 1º turno:

```text
https://resultados.tse.jus.br/oficial/ele2026/6257/dados/
```

O painel consulta **somente** esta lista fixa:

- `br/br-c0001-e006257-u.json`
- 27 UFs: `{uf}/{uf}-c0001-e006257-u.json`
- exterior: `zz/zz-c0001-e006257-u.json`

Total: **29 requisições por rodada**.

Catálogo de eleições:

```text
https://resultados.tse.jus.br/oficial/comum/config/ele-c.json
```

Malha do mapa:

```text
https://raw.githubusercontent.com/fititnt/gis-dataset-brasil/master/uf/topojson/uf.json
```

## Comportamento

- Atualização automática a cada 60 segundos.
- Os 29 arquivos são buscados **em sequência**, com intervalo de 150 ms entre requisições.
- Timeout por arquivo: 12 s.
- Não são tentados endereços alternativos nem UFs fora da lista fixa.
- Se uma requisição falhar, o último valor válido daquela unidade é mantido.
- O cache de último valor válido também é salvo em `localStorage`.
- A tela sinaliza `⚠` e informa que o dado não foi atualizado naquela rodada.
- O horário exibido como “TSE” vem de `dg` + `hg` do próprio arquivo.
- “Atualizado há X segundos” mede o tempo desde a última leitura bem-sucedida do arquivo nacional.
- Candidatos são localizados pelo **número 13 e 22**, evitando dependência da grafia do nome.
- Percentuais eleitorais exibidos são os campos oficiais `pvap`, isto é, percentuais dos votos válidos.
- O quadro regional de urnas é recalculado por `Σ st / Σ ts`, não pela média simples dos percentuais estaduais.
- O histórico nacional grava no máximo 1.200 pontos distintos no navegador.

## Rodar localmente

Não é necessário instalar dependências. Para evitar restrições de `file://`, sirva a pasta por HTTP.

### Python

```bash
cd painel-tse-presidente-2026
python -m http.server 8000
```

Abra:

```text
http://localhost:8000
```

Testes:

```text
http://localhost:8000/tests.html
```

### Node.js

```bash
npx serve .
```

## Trocar para o 2º turno

No arquivo `app.js`, altere:

```js
electionId: "6257"
```

para:

```js
electionId: "6258"
```

O código gera automaticamente `e006258` no nome dos arquivos.

Nos testes, em `tests.js`, altere:

```js
const BASE = "https://resultados.tse.jus.br/oficial/ele2026/6257/dados";
```

e os nomes `e006257` para `e006258`.

Antes da publicação do 2º turno, confirme o código no catálogo oficial do TSE:

```text
https://resultados.tse.jus.br/oficial/comum/config/ele-c.json
```

## Limites e cautelas do TSE

O projeto respeita o limite informado de até 100 requisições/s por IP ao fazer apenas uma requisição de cada vez e esperar 150 ms entre arquivos (aprox. 6,7 req/s durante a rodada). Não há varredura de URLs nem tentativa automática de códigos alternativos, reduzindo o risco de 404 repetidos e bloqueio temporário.

A rodada completa tem 29 arquivos. Se todos responderem rapidamente, leva cerca de 4,2 s apenas de espaçamento; a próxima rodada é agendada para completar aproximadamente 60 s desde o início da rodada anterior, sem sobreposição.

## Testes mínimos

`tests.html` executa:

1. conversão de `1.234.567` → `1234567`;
2. conversão de `50,41` → `50.41`;
3. falha simulada preservando o último valor;
4. card com largura máxima de 380 px, proporção 1:1 e fundo `#ffffff`;
5. TopoJSON reconhecendo 27 UFs;
6. integração ao vivo: soma de 27 UFs + exterior versus Brasil para votos válidos e votos dos candidatos 13/22.

### Observação sobre o teste de soma

Votos são inteiros, portanto o estado consistente final deveria fechar exatamente. Durante a apuração, porém, os 29 arquivos podem ser publicados em instantes diferentes. O teste:

- `PASS`: soma exata;
- `WARN`: diferença de até 0,1% enquanto os arquivos estão em atualização;
- `FAIL`: diferença superior a 0,1%.

Isso evita classificar como erro de cálculo uma janela transitória de publicação não atômica.

## Publicar no GitHub Pages

1. Crie um repositório e envie todos os arquivos da pasta para a raiz.
2. No GitHub, abra **Settings → Pages**.
3. Em **Build and deployment**, selecione **Deploy from a branch**.
4. Branch: `main`; pasta: `/ (root)`.
5. Salve. O endereço terá o formato `https://usuario.github.io/repositorio/`.

Não há build.

## Publicar no Netlify

1. Crie um novo site no Netlify.
2. Faça upload da pasta do projeto ou conecte o repositório.
3. Build command: deixe vazio.
4. Publish directory: `.`

## Dependências carregadas por CDN

- D3 v7.9.0
- topojson-client v3.1.0

Os dados eleitorais não passam por essas bibliotecas; elas são usadas apenas para visualização.

## Critérios eleitorais

O painel **não declara vencedor**, não calcula probabilidade e não faz projeção. A linha de 50% serve apenas como referência visual sobre votos válidos. Toda informação eleitoral vem dos arquivos oficiais do TSE.

## Diagnóstico no navegador

No console:

```js
TSE2026.diagnostics()
```

Retorna quantidade de escopos carregados, falhas da rodada e comparação entre totais locais e nacional.