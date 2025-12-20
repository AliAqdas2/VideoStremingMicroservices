FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p /app/temp_uploads

EXPOSE 3005

CMD ["npm", "start"]

