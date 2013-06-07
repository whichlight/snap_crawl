var request = require('request'),
    jsdom = require('jsdom'),
    step = require('step'),
    redis = require('redis'),
    db = redis.createClient();


db.on("error", function (err) {
  console.log("Error " + err);
});

var jquery_path = "./libs/jquery-1.10.1.min.js";

//keep track of number of concurrent requests
var conReqs = 0;

function getSnapNodes(user, fn) {
  db.get(user, function(err, result){
    if (result) {
      console.log("skipping " + user);
      fn();
    }
    else {
      conReqs++;
      console.error(conReqs, user);
      var req = "http://www.snapchat.com/";
      request(req + user, function (err, response, body) {
        conReqs--;
        if (conReqs==0) {
          start();

        }
        if (err || response.statusCode != 200) {
          return setTimeout(function(){getSnapNodes(user,fn)});
        }
        else {
          fn(null, user, body)
        }
      });
    }
  });
}

function saveResults(results, fn){
  db.set(results["user"], JSON.stringify(results), function(){
    db.lpush('index', results["user"], fn);
  });
}

function createRequest(req_user, i) {
  return function(err, res_user, body) {
    if (err || res_user) {
      pullNodes(err, res_user, body);
    }
    getSnapNodes(req_user, this);
  }
}


// user can be the actual data if it was in the DB
function pullNodes(err, user, body){
  jsdom.env({
    html: body,
    scripts: [jquery_path]
  }, function (err, window) {
    var $ = window.jQuery;
    var friends = $(".best_name a");
    var results = {};
    var scraped_user = $("#name_text").text();

    if (scraped_user === "") {
      getSnapNodes(user, pullNodes);
    }
    else {
      results['user']= user;
      var score = $("#score").text().split(":")[1].replace(/\s+/g, ' ');
      besties = [];
      for(var i=0;i<friends.length;i++){besties.push(friends[i].innerHTML)};
      results['friends']=besties;
      results['score']=score;
      results['time'] = Math.floor(Number(new Date())/1000.0);
      saveResults(results, function(){
        var reqs = [];
        var i=0;
        besties.forEach(function(f){
          reqs.push(createRequest(f, i++))
        })
        step.apply(null, reqs);
      });

    }
  });
}

function findSeed(err, candidate) {
  if (!candidate) {
    throw new Error('couldn\'t find a seed :(');
  }
  db.get(candidate, function(err, result) {
    if (result) {
      var data = JSON.parse(result),
          friends = data['friends'];
      findSeed(null, friends[Math.floor(Math.random() * friends.length)]);
    } else {
      getSnapNodes(candidate, pullNodes);
    }
  });
}

function start(){
step(
  function() {
    db.on("connect", this);
  },
  function(err) {
    db.select(10, this);
  },
  function(err) {
    db.llen("index", this);
  },
  function(err, len){
    db.lindex("index", len - 1, this);
  },
  findSeed
);
}

start();
