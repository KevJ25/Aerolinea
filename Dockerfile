# =============================================================================
# Imagen de la aplicación (backend NestJS y pantallas) · sección 15.3
# Fijación de versión: tras la primera construcción aprobada, sustituya la
# etiqueta por su digest para que la imagen no cambie sin solicitud de cambio.
# =============================================================================
FROM node:22-bookworm-slim AS construccion
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=construccion /app/node_modules ./node_modules
COPY --from=construccion /app/dist ./dist
COPY package.json ./
COPY publico ./publico
# La aplicación no se ejecuta como root
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=12 \
    CMD node -e "fetch('http://127.0.0.1:3000/salud').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/main.js"]
