FROM node:22-slim
RUN set -eux; \
    if [ -f /etc/apt/sources.list.d/debian.sources ]; then sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list.d/debian.sources; fi; \
    if [ -f /etc/apt/sources.list ]; then sed -i 's|deb.debian.org|mirrors.tuna.tsinghua.edu.cn|g' /etc/apt/sources.list; fi; \
    apt-get update; \
    apt-get install -y --no-install-recommends git procps; \
    rm -rf /var/lib/apt/lists/*
WORKDIR /bench
COPY lib lib
COPY gen-fixtures.js run.js flame.js ./
ENTRYPOINT ["node"]
