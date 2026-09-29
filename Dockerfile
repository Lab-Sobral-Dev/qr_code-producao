FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY . .

# Banco SQLite local (alcool_registros/alcool_registros_historico), mesmo
# padrao do monitor-impressoras: arquivo dentro de um volume persistente
# para o cadastro sobreviver a recriacao do container.
ENV DATABASE_PATH=/data/banco.db
VOLUME ["/data"]

EXPOSE 3000

CMD ["node", "server.js"]
