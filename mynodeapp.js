var express = require('express');
var bodyParser = require('body-parser');
var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectID;
var Promises = require('promises');
var Mustache = require('mustache');
var fetch = require('node-fetch');

var u = require('util');

var app = express();
var server = require('http').createServer(app);

var db;

function taskGen(template, data) {
  console.log( "New execute taskGen" );
  var result = new Object();    // Результат запросов в БД
  
  // Не использовать вложенный код говорите
  // Больше вложенностей богу промисей
  var promise = new Promise( ( resolve, reject ) => {
    // Найти темплейт по значению ключа template в коллекции templates
    console.log('Search template by name', template );
    db.collection("templates").findOne( {"template": template}, function( err, item ) {
      if( err != undefined ) { reject( 'database error' ); }
      if( item == null )     { reject( 'template ' + template + ' not found' ); }
      console.log("Template %s found", template );
      result.template = item;     // Заносим результат в обьект
	  delete result.template['_id']; // Удаляем ID шаблона из шаблона так как в таске у нас не должно быть ID
      resolve(result);            // Возвращаем обьект
    });
  })
  promise.then( result => {            // Если все успешно в первом запросе
    return new Promise( ( resolve, reject ) => {
      // Найти данные по _id в коллекции _channels
      console.log('Search channel by ID', data );
      db.collection("_channels").findOne( {"_id": data}, function( err, item ) {
        if( err != undefined ) { reject( 'database error' ); }
        if( item == null ) { reject( 'ID ' + data + ' not found' ); } 
        console.log( "TODO: (%s == null) == FALSE", item ); // TODO: null != null !!!!!!!!!!!!!!!!!!!!!!
        console.log("Channel ID %s found", item._id );
        result.channel = item;     // Заносим результат в обьект
        resolve(result);           // Возвращаем обьект
      });
    });
  }, error => {                    // Если в первом запросе произошла ошибка
    console.error("Search template error: %s", error );
  }).then( result => {             // Если все успешно во втором запросе

	// Сгенерировать таск
	console.log('Generate new task');
	var genPort = 42000 + parseInt(result.channel.code) +
                          parseInt(result.channel.resolution); // Генерация genPort по указанной методе.
	var channel = result.channel;
	var $tpl = JSON.stringify( result.template );			   // Превращаем наш шаблон в строку
	$tpl = $tpl.replace( /\'/g, "\'" );						   // Заменяем все ' на \' если вдруг будет кавычка в шаблоне
	$tpl = 'var newTask = JSON.parse(\'' + $tpl + '\');';      // Добавляем определение переменной и чтобы сразу парсилось в JSON
	$tpl = $tpl.replace(/{{(.*?)}}/gim, "' + $1 + '");         // Заменяем {{var}} на ' + var + '
	eval( $tpl );                                              // Исполняем получившийся код
	console.log( newTask );

    /* Подготавливаем данные для генерации (Узнаем ExposePorts)
	var rdata  = new Object();
    rdata.genPort = 42000 + parseInt(result.channel.code) +
                            parseInt(result.channel.resolution); // Генерация genPort по указанной методе.
    rdata.channel = result.channel;
	var newTask = JSON.parse( Mustache.render( JSON.stringify( result.template ), rdata ) );*/
	
	
        
    // Постим таск через Rest API с помощью нового метода fetch
    console.log('Trying send task via REST API');
 
    fetch('http://127.0.0.1:3000/api/tasks', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 15000, // 15sec in ms
      body: JSON.stringify( newTask )
    }).then( res => {
        console.log('Send Rest API status', res.status, res.statusText );
        return res.json();
    }).then( json => {
        // Получили ID теперь можем добавлять в базу
        console.log( 'Got new _id', json._id );
        newTask.created = json._id;

        // Постим таск в БД
        console.log('Trying to create new task')
        db.collection("tasks").insertOne( newTask, function(err,doc) {
            if( err != undefined ) { console.error('Database error:', err.message ); }
            else if( doc == null ) { console.error('Database unknown error'); }
            else { console.log('New task created:', doc.insertedId); }
        });        
    }).catch( res => {
        console.log('Send Rest API fail');
    });
  }, error => {                     // Если во втором запросе произошла ошибка
    console.error("Search channel error: %s", error );
  });
}


app.use(express.static('static'));
app.use(bodyParser.json());

// Добавляет таск сразу в базу
app.post('/api/tasks', function(req, res) {
  console.log("Recieve request for new task via POST /api/tasks" );
  var newTask = req.body;
  var send = '';
  console.log('Trying to put task to DB..');
  db.collection("tasks").insertOne( newTask, function(err,doc) {
    if( err != undefined ) { 
      console.error('Database error:', err.message  );
      res.statusCode = 500;
    } else if( doc != null ) {
      console.log('New task created:', doc.insertedId);
      res.statusCode = 200;
      send = { "_id": doc.insertedId };
    } else {
      console.log('Database unknown error');
      res.statusCode = 500;
    }
    res.send(send);
  });
});

// Простой тестовый вызов
app.get('/test', function(req, res) {
    res.send('');
    var template    = 'true-grabber';
    var data        = '57bc7a5fdc80371b3c54702c';
    taskGen(template, data);
});

MongoClient.connect('mongodb://localhost/channelsdb', function(err, dbConnection) {
  db = dbConnection;
  var webapp = server.listen(3000, function() {
    var port = webapp.address().port;
    console.log("Started webapp at port", port);
  });
});
