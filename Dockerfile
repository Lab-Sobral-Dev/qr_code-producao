FROM node:22-alpine AS builder

WORKDIR /app

# better-sqlite3@13 exige Node >=22 (confirmado: crash/segfault real rodando
# sob Node 20, nao so aviso de engine) -- por isso a imagem sobe pra 22 aqui.
# Tambem e modulo nativo -- sem prebuild pro musl/alpine deste target, precisa
# compilar via node-gyp (python3 make g++). So nesta etapa: a imagem final nao
# carrega o toolchain, so o resultado compilado.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Banco SQLite local (alcool_registros/alcool_registros_historico), mesmo
# padrao do monitor-impressoras: arquivo dentro de um volume persistente
# para o cadastro sobreviver a recriacao do container.
ENV DATABASE_PATH=/data/banco.db
VOLUME ["/data"]

EXPOSE 3000

CMD ["node", "server.js"]
