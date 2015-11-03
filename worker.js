var async = require('async');
var superagent = require('superagent');
var config = require('config');
var MongoClient = require('mongodb').MongoClient;
var _ = require('underscore');
var http = require('http');

var mongodbConnection;

//When this script was written, three challenges were already completed.
//The endpoint used gives only active challenges
//Thus, this function inserts the three completed challenges into the database
//so that the worker can get the results for these three challenges
function _insertOldChallengesIntoDatabase(callback) {
    //First check if these challenges already exist in the database
    var challengeIds = _.pluck(config.OLD_CHALLENGES, 'challengeId');

    mongodbConnection.collection(config.CHALLENGES_COLLECTION)
        .find({
            challengeId: {
                '$in': challengeIds
            }
        })
        .toArray(function (err, challenges) {
            if (err) {
                callback(err);
            } else if (challenges.length === challengeIds.length) {
                //Challenges already exist. Continue
                callback();
            } else if (challenges.length === 0) {
                //Nope. No old challenges exist. Add them
                mongodbConnection.collection(config.CHALLENGES_COLLECTION)
                    .insertMany(config.OLD_CHALLENGES, function (err, results) {
                        if (err) {
                            callback(err);
                        } else if (results.insertedCount !== config.OLD_CHALLENGES.length) {
                            callback(new Error('Not all old challenges were inserted into the database. Not sure what\'s up'));
                        } else {
                            callback();
                        }
                    });
            } else {
                callback(new Error('Database corrupted. Some old challenges found in the database'));
            }
        });
}


//Gets the challenges applicable for Swiftoberfest
function _getChallengesFromTopcoder (callback) {
    superagent.get(config.CHALLENGE_URL)
        .query(config.CHALLENGE_FILTER)
        .end(function (err, res) {
            if (err) {
                callback(err);
            } else if (res.body && res.body.data) {
                var challenges = _.filter(res.body.data, function (c) {
                    if (c.challengeName.toLowerCase().indexOf(config.KEYWORD.toLowerCase()) !== -1) {
                        return true;
                    }

                    return false;
                });

                callback(err, challenges);
            } else {
                callback(new Error('Error. No response received when fetching challenges for Swiftoberfest'));
            }
        });
}

//Gets all the challenges stored in our database
function _getChallengesFromDatabase (challengesFromTopcoder, withCommunity, callback) {
    var projection = {
        challengeId: 1,
        _id: 0
    };

    if (withCommunity) {
        projection.challengeCommunity = 1;
    }

    mongodbConnection.collection(config.CHALLENGES_COLLECTION)
        .find({}, projection)
        .toArray(function (err, challengesFromDb) {
            var challengeIdsFromDb;

            if (err) {
                callback(err);
            } else if (!withCommunity) {
                if (challengesFromDb.length > 0) {
                    challengeIdsFromDb = _.pluck(challengesFromDb, 'challengeId');
                } else {
                    challengeIdsFromDb = [];
                }
            } else {
                challengeIdsFromDb = challengesFromDb;
            }

            if (challengesFromTopcoder) {
                callback(err, challengesFromTopcoder, challengeIdsFromDb);
            } else {
                callback(err, challengeIdsFromDb);
            }
        });
}

//Get challenges that do not exist in the database but have been returned by topcoder
function _getNewChallenges (challengesFromTopcoder, challengeIdsFromDb, callback) {
    var newChallenges = _.map(
        _.filter(challengesFromTopcoder, function (c) {
            if (challengeIdsFromDb.indexOf(c.challengeId) !== -1) {
                return false;
            }

            return true;
        }), function (c) {
            var challenge = {};

            //Get the attributes that we need to store in the database
            challenge.challengeId = c.challengeId;
            challenge.status = c.status;
            challenge.registrationStartDate = c.registrationStartDate;
            challenge.challengeName = c.challengeName;
            challenge.challengeCommunity = c.challengeCommunity;

            return challenge;
        });

    if (!newChallenges) {
        newChallenges = [];
    }

    callback(null, newChallenges);
}

//Inserts new challenges into the database
function _insertNewChallengesIntoDatabase(newChallenges, callback) {
    mongodbConnection.collection(config.CHALLENGES_COLLECTION)
        .insertMany(newChallenges, function (err, results) {
            if (err) {
                callback(err);
            } else if (results.insertedCount !== newChallenges.length) {
                callback(new Error('Not all new challenges were inserted into the database. Not sure what\'s up'));
            } else {
                callback();
            }
        });
}

//Get the results for a challenge
function _getChallengeResults(challengeId, challengeCommunity, callback) {
    var url;

    if (challengeCommunity === config.DEVELOP_TYPE) {
        url = config.DEVELOP_RESULT_URL + challengeId;
    } else {
        url = config.DESIGN_RESULT_URL + challengeId;
    }

    superagent.get(url)
        .end(function (err, res) {
            var challengeDetails = {};

            if (err) {
                //Is it a legit error or an error that occurs because the challenge is still active
                //(and hence no results for that challenge)?
                if (res && res.body && res.body.error) {
                    if (res.body.error.details === config.NO_RESULTS_MESSAGE) {
                        return callback();
                    }
                }

                callback(err);
            } else if (res.body && res.body.results) {
                challengeDetails.challengeEndDate = res.body.challengeEndDate
                challengeDetails.results = res.body.results;

                callback(err, challengeDetails);
            } else {
                callback(new Error('Error. No response received when fetching challenges for Swiftoberfest'));
            }
        });
}

//Returns score based on placement
function _getScore (placement) {
    var score = 100 - ((placement - 1) * 10);

    if (score < 0) {
        //Minimum is 10
        score = 10;
    }

    return score;
}

//Prepares the leaderboard
function _prepareLeaderboard (results, callback) {
    var rankings = [];

    async.each(config.MONTHS, function (month, cb1) {
        var ranks = {},
            scores = [],
            usernames;

        //Get all results that are applicable for the current month
        var currentMonthResults = _.filter(results, function (r) {
            var challengeEndDate = new Date(r.challengeEndDate);

            return (challengeEndDate <= config.END_DATE[month]) && (challengeEndDate >= config.START_DATE[month]);
        });

        ranks.month = month;
        ranks.scores = {};

        //Now, update the scores for each participatn
        currentMonthResults.forEach(function (r) {
            r.results.forEach(function (p) {
                //Participant is considered only if they have a passing score in their submission
                if (p.finalScore >= config.PASSING_SCORE) {
                    if (_.has(ranks.scores, p.handle)) {
                        //Participant is already part of the rankings. Add to the existing score.
                        ranks.scores[p.handle] += _getScore(p.placement);
                    } else {
                        ranks.scores[p.handle] = _getScore(p.placement);
                    }
                }
            });
        });

        //Format the scores better - primarily because the handles can contain charactes such as dot(.)
        //which mongodb will not allow as a key in the document
        usernames = _.keys(ranks.scores);

        scores = _.map(usernames, function (u) {
            var participant = {};

            participant.handle = u;
            participant.score = ranks.scores[u];

            return participant;
        });

        ranks.scores = scores;

        rankings.push(ranks);
        cb1();
    }, function (err) {
        callback(err, rankings);
    });
}

//Updates the leaderboard in the database
function _updateLeaderboardInDatabase (ranks, callback) {
    //Drop the collection and create it again. We are not selectively updating the rankings
    //but simply inserting new rankings
    mongodbConnection.dropCollection(config.LEADERBOARD_COLLECTION, function (err) {
        if (err) {
            //ns not found error is thrown when the collection to be dropped does not exist.
            //Hence, in our case, we can ignore this error.
            if (err.message !== 'ns not found') {
                return callback(err);
            }
        }
        mongodbConnection.collection(config.LEADERBOARD_COLLECTION)
            .insertMany(ranks, function (err, results) {
                if (err) {
                    callback(err);
                } else if (results.insertedCount !== ranks.length) {
                    callback(new Error('Not all scores were inserted into the database. Not sure what\'s up'));
                } else {
                    callback();
                }
            });
    });
}

//Function that gets all the challenges and their results and then updates the leaderboard
function _calculateRankings (callback) {
    async.waterfall([
        function (cb1) {
            //Get all the challenges applicable for swiftoberfest from topcoder
            console.log('Get challenges from topcoder...');
            _getChallengesFromTopcoder(cb1);
        },
        function (challenges, cb2) {
            //Get all challenges (only ids) that we have already read and stored in database
            console.log('Get old challenges from database...');
            _getChallengesFromDatabase(challenges, false, cb2);
        },
        function (challengesFromTopcoder, challengeIdsFromDb, cb3) {
            //Detect the new challenges
            console.log('Determining the new challenges from topcoder...');
            _getNewChallenges(challengesFromTopcoder, challengeIdsFromDb, cb3);
        },
        function (newChallenges, cb4) {
            if (newChallenges.length > 0) {
                //Store the new challenges in the database
                console.log('Adding new challenges into database...');
                _insertNewChallengesIntoDatabase(newChallenges, cb4);
            } else {
                console.log('No new challenges found');
                cb4();
            }
        },
        function (cb5) {
            //Get all challenges in the database so that we can get their results
            //We are NOT storing the results though (only the final leaderboard)
            //This is because if any of the challenges have a dispute and the results are updated,
            //we do not want to use the invalid results.
            //Thus, we are going to get the results each time
            console.log('Getting current challenges in database...');
            _getChallengesFromDatabase(null, true, cb5);
        },
        function (challenges, cb6) {
            //Get the results for the challenges
            console.log('Getting challenges results');
            async.mapLimit(challenges, 5, function (challenge, cb7) {
                _getChallengeResults(challenge.challengeId, challenge.challengeCommunity, cb7);
            }, cb6);
        },
        function (results, cb8) {
            //Some challenges could still be active and thus no results will exist for them
            //Keep only the valid results
            console.log('Preparing leaderboard...');
            var validResults = _.filter(results, function (r) {
                return !!r;
            });

            _prepareLeaderboard(validResults, cb8);
        },
        function (ranks, cb9) {
            console.log('Updating leaderboard...');
            _updateLeaderboardInDatabase(ranks, cb9);
        }
    ], function (err) {
        if (err) {
            console.log('Error. Could not update leaderboard');
            console.log(err);
        } else {
            console.log('Success. Leaderboard updated successfully (database only).');
        }
        callback();
    });
}

function _updateLeaderboard () {
    _calculateRankings(function () {
        console.log('Sleeping now. Will be checking again in', config.INTERVAL, 'milliseconds');
    });
}

//Start with by connecting to the database
MongoClient.connect(config.MONGODB_URL, function (err, db) {
    if (err) {
        console.log('Error. Could not connect with MongoDB');
        console.log(err);
    } else {
        mongodbConnection = db;

        //Insert already completed challenges into the database
        _insertOldChallengesIntoDatabase(function (err) {
            if (err) {
                console.log('Error. Could not insert old challenges into the database');
                console.log(err);
                mongodbConnection.close();
            } else {
                console.log('Success. Added old challenges into the database. Proceeding to update the leaderboard');

                setInterval(_updateLeaderboard, config.INTERVAL);
            }
        });
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

var server = http.createServer(handleRequest);

server.listen(config.PORT, function () {
    console.log('Server started and listening on port', config.PORT);
});
