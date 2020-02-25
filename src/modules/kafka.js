module.exports = {
  name: 'kafka',
  image: 'wurstmeister/kafka:latest',
  languages: {
    nodejs: ['kafka-node', 'kafka-node', 'kafkajs'],
    python: ['kafka-python']
  },
  ports: [9092, 9094]
}
