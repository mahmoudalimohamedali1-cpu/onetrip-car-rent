# One Trip — WhatsApp bridge (zero npm deps)
FROM node:20-alpine

WORKDIR /app

# لا توجد تبعيات؛ ننسخ package.json للوضوح فقط ثم بقية الملفات.
COPY package.json ./
COPY . .

# المنفذ الافتراضي (المنصّة قد تمرّر PORT مختلفًا).
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
