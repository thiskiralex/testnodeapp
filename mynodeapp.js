var express = require('express');
var bodyParser = require('body-parser');
var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectID;
var Promises = require('promises');
var Mustache = require('mustache');
var fetch = require('fetch');

var u = require('util');

var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server);

var db;

function taskGen(template, data) {
  var result = new Object();

  // Не использовать вложенный код говорите
  var promise = new Promise( function ( resolve, reject ) {
    // Найти темплейт по значению ключа template в коллекции templates
	console.log('Search template by name', template );
    db.collection("templates").findOne( {"template": template}, function( err, item ) {
      result.template = item;
      resolve(result);
    })
  }).then( function( result ) {
    return new Promise( function(resolve, reject) {
      // Найти данные по _id в коллекции _channels
	  console.log('Search channel by id', data );
      db.collection("_channels").findOne( {"_id": data}, function( err, item ) {
        result.channel = item;
        resolve(result);
      })
    })
  }).then( function( result ) {
    
    // Подготавливаем данные для генерации (Узнаем ExposePorts)
    var rdata	  = new Object();
    rdata.genPort = 42000 + parseFloat(result.channel.code.trim()) +
							parseFloat(result.channel.resolution.trim()); // Генерация genPort по указанной методе.
    rdata.channel = result.channel;

	// Сгенерировать таск
    var newTask = JSON.parse( Mustache.render( JSON.stringify( result.template ), rdata ) );
	console.log('Generate new task');

    // Постим таск через Rest API с помощью нового метода fetch
    fetch('http://127.0.0.1:3000/api/tasks', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify( newTask )
    }).then( function(res) {
		console.log('THEN');
      //console.log( u.inspect( response ) );
    }).catch( function(res) {
		console.log('CATCH');
	});
	
	
	newTask.created = result.channel._id;
	delete newTask['_id'];

	
	// Добавить к таску обьект created
	//newTask.created = new_id;

    // Постим таск в БД
    db.collection("tasks").insertOne( newTask, function(err,doc) {
		console.log('New task created:', doc.insertedId);
    });
		
  });
}


app.use(express.static('static'));
app.use(bodyParser.json());

// Добавляет таск сразу в базу
app.post('/api/tasks', function(req, res) {
  console.log("Got new task!" );
  var newTask = req.body;
  db.collection("tasks").insertOne( newTask, function(err,doc) {
    console.log('New task created:', doc.insertedId);
	res.statusCode = 200;
	res.send( { "_id": doc.insertedId } );
  });
});

app.get('/test', function(req, res) {

	var template	= 'true-grabber';
	var data		= '57bc7a5fdc80371b3c54702c';
	res.send('');
	taskGen(template, data);
	
});

MongoClient.connect('mongodb://localhost/channelsdb', function(err, dbConnection) {
  db = dbConnection;
  var webapp = server.listen(3000, function() {
    var port = webapp.address().port;
    console.log("Started webapp at port", port);
  });
});
