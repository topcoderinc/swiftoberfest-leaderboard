var config = require('config');
var MongoClient = require('mongodb').MongoClient;
var http = require('http');

var mongodbConnection;

//Start with by connecting to the database
MongoClient.connect(config.MONGODB_URL, function (err, db) {
    if (err) {
        console.log('Error. Could not connect with MongoDB');
        console.log(err);
    } else {
        mongodbConnection = db;

        var server = http.createServer(handleRequest);

        server.listen(config.PORT, function () {
            console.log('Server started and listening on port', config.PORT);
        });
    }
});

//Gracefully exit
process.on('SIGINT', function () {
    console.log('Received SIGINT signal. Closing database connections, if any');
    if (mongodbConnection) {
        mongodbConnection.close(function (err) {
            if (err) {
                console.log('Error. Could not close the db connection');
                console.log(err);
            } else {
                console.log('Success. Database connection has been closed');
            }

            process.exit();
        });
    } else {
        console.log('No database connections found. Exiting');
        process.exit();
    }
});

//Gracefully exit
process.on('SIGTERM', function () {
    console.log('Received SIGTERM signal. Closing database connections, if any');
    if (mongodbConnection) {
        mongodbConnection.close(function (err) {
            if (err) {
                console.log('Error. Could not close the db connection');
                console.log(err);
            } else {
                console.log('Success. Database connection has been closed');
            }

            process.exit();
        });
    } else {
        console.log('No database connections found. Exiting');
        process.exit();
    }
});


//Handles any HTTP GET Requests
function handleRequest(request, response) {
    if (request.method === 'GET') {
        if (mongodbConnection) {
            mongodbConnection.collection(config.LEADERBOARD_COLLECTION)
                .find({})
                .toArray(function (err, ranks) {
                    if (err) {
                        console.log('Error. Cannot get the ranks currently');
                        console.log(err);
                        response.statusCode = 500;
                        response.end();
                    } else {
                        response.writeHead(200, {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        });
                        response.write(JSON.stringify(ranks));
                        response.end();
                    }
                });
        } else {
            response.statusCode = 202;
            response.end();
        }
    } else {
        response.statusCode = 405;
        response.end();
    }
}
