require 'socket'
require 'time'
require 'rack'
require 'rack/utils'

# app = Rack::Lobster.new
server = TCPServer.open('0.0.0.0', 9000)

app = Proc.new do |env|
  req = Rack::Request.new(env)
  case req.path
  when "/"
    body = "Hello world from a Ruby webserver!!"
    [200, {'Content-Type' => 'text/html', "Content-Length" => body.length.to_s}, [body]]
  else
    [404, {"Content-Type" => "text/html"}, ["Ah!!!"]]
  end
end

while connection = server.accept
  request = connection.gets
  method, full_path = request.split(' ')
  path = full_path.split('?')

  status, headers, body = app.call({
    'REQUEST_METHOD' => method,
    'PATH_INFO' => path
  })

  head = "HTTP/1.1 200\r\n" \
  "Date: #{Time.now.httpdate}\r\n" \
  "Status: #{Rack::Utils::HTTP_STATUS_CODES[status]}\r\n"

  headers.each do |k,v|
    head << "#{k}: #{v}\r\n"
  end

  connection.write "#{head}\r\n"

  body.each do |part|
    connection.write part
  end

  body.close if body.respond_to?(:close)

  connection.close
end
