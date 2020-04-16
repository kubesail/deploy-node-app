module.exports = {
  name: 'kafka',
  image: 'wurstmeister/kafka:latest',
  languages: {
    nodejs: ['kafka-node', 'kafkajs'],
    python: ['kafka-python'],
    php: ['rdkafka'],
    ruby: ['ruby-kafka', 'rdkafka']
  },
  ports: [9092, 9094]
}
