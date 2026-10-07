FROM node:22-alpine
WORKDIR /app
COPY src ./src
# Il volume nasce dalla cartella dell'immagine: deve essere dell'utente node, o lo stato non si salva.
RUN mkdir -p /data && chown node:node /data
ENV NODE_ENV=production DATA_DIR=/data PORT=8097
USER node
EXPOSE 8097
HEALTHCHECK --interval=60s --timeout=5s CMD wget -qO- http://127.0.0.1:8097/salute >/dev/null || exit 1
CMD ["node", "src/server.js"]
