var request = require('request'),
    jsdom = require('jsdom'),
    step = require('step'),
    redis = require('redis'),
    db = redis.createClient(),
    _ = require("underscore");

db.on("error", function (err) {
  console.log("Error " + err);
});

var jquery_path = "./libs/jquery-1.10.1.min.js";

function NodeQueue(opts){
  if (!(this instanceof NodeQueue)){
    return new NodeQueue(opts)
  }

  this.config = _.extend({
  },opts);

  this.store = [];

}

NodeQueue.prototype.enqueue = function(name) {

  console.log(this.store.length);
  //todo make sure we havent already done this
  this.store.push(name);

}

NodeQueue.prototype.dequeue = function() {

  if (this.store.length === 0) {
    return;
  }

  return this.store.shift();

}

function NodeTraverser(opts){
  if (!(this instanceof NodeTraverser)){
    return new NodeTraverser(opts)
  }

  this.config = _.extend({

  },opts);

}

NodeTraverser.prototype.next = function(){
  var user = this.config.queue.dequeue(),
      self = this;


 console.log(user);
  db.get(user, function(err, result) {
    if (result) {
      dbParser(result, function(err,friends){
        self.friendsHandler(err,friends)


      });
    }
    else{
      //htmlparser
      var req = "http://www.snapchat.com/";
      request(req + user, function (err, response, body) {
        if (err || response.statusCode != 200) {
          return setTimeout(function(){getSnapNodes(user,fn)});
        }
        else {
          htmlParser(user, body,function(err, friends){
            self.friendsHandler(err,friends)
          })
        }
      });
    }
  });
}



NodeTraverser.prototype.friendsHandler = function(err, friends){
  var self = this;
  friends.forEach(function(f) {
    self.config.queue.enqueue(f);
  })

  this.next();
}

function htmlParser(user, body, fn){

  jsdom.env({
    html: body,
  scripts: [jquery_path]
  }, function (err, window) {

    var $ = window.jQuery;
    var friends = $(".best_name a");
    var results = {};
    var scraped_user = $("#name_text").text();

    if (scraped_user === "") {
      return fn(null,[user]);
    }
    else {
      results.user = user;
      var score = Number($("#score").text().split(":")[1]);
      besties = [];
      friends.each(function(key, val){besties.push(val.innerHTML)});
      results.friends = besties;
      results.score = score;
      results.time = Math.floor(Number(new Date()) / 1000.0);
      saveResults(results, function() {
        fn(null, besties);
      });
    }
  })
}

function dbParser(record, fn){
  var data = JSON.parse(record);
  fn(null,data.friends);
}



function saveResults(results, fn){
  db.set(results["user"], JSON.stringify(results), function(){
    db.lpush('index', results["user"], fn);
  });
}


step(
    function() {
      db.on("connect", this);
    },
    function(err) {
      db.select(10, this);
    },
    function(err){
      var queue = NodeQueue();
      var worker = NodeTraverser({queue:queue});
      queue.enqueue("whichlight");
      worker.next();
    }
    );


