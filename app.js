let express = require('express')
let {open} = require('sqlite')
let sqlite3 = require('sqlite3')
let bcrypt = require('bcrypt')
let jwt = require('jsonwebtoken')
let path = require('path')
let db = null
let dbPath = path.join(__dirname, 'twitterClone.db')
let app = express()
app.use(express.json())
InitialiseDbAndserver = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('The server is run down by the Saiyan.....')
    })
  } catch (e) {
    console.log(`The error is ${e.message}`)
  }
}
InitialiseDbAndserver()

app.post('/register/', async (request, response) => {
  let {username, password, name, gender} = request.body
  let query = `select * from user where username = '${username}';`
  let hashedPassword = await bcrypt.hash(password, 10)
  let res = await db.get(query)
  if (res !== undefined) {
    response.status(400)
    response.send('User already exists')
  } else if (password.length < 6) {
    response.status(400)
    response.send('Password is too short')
  } else {
    let q1 = `insert into user (name,username,password,gender)
              values ('${name}','${username}','${hashedPassword}',
              '${gender}');`
    let res = await db.run(q1)
    response.status(200)
    response.send('User created successfully')
  }
})

app.post('/login/', async (request, response) => {
  let {username, password} = request.body
  let query = `select * from user where username='${username}';`
  let res = await db.get(query)
  if (res === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    let passCheck = await bcrypt.compare(password, res.password)
    if (passCheck === false) {
      response.status(400)
      response.send('Invalid password')
    } else {
      let payLoad = {
        username: username,
      }
      let jwtToken = await jwt.sign(payLoad, 'jessy')
      response.send({jwtToken})
    }
  }
})

checkToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'jessy', async (error, payLoad) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payLoad.username
        next()
      }
    })
  }
}
checkTweetId = async (request, response, next) => {
  let {tweetId} = request.params
  let q1 = `select 
            tweet.tweet_id 
            from tweet 
            inner join 
            follower 
            on follower.following_user_id = tweet.user_id
            where 
            follower.follower_user_id=
            (select user_id from user where username='${request.username}')
            ;`
  let res = await db.all(q1)
  console.log(res)
  let found = false
  for (let element of res) {
    if (element.tweet_id === parseInt(tweetId)) {
      found = true
      break
    }
  }
  if (found === false) {
    response.status(400)
    response.send('Invalid Request')
  } else {
    next()
  }
}

app.get('/user/tweets/feed/', checkToken, async (request, response) => {
  let query = `select user.username,tweet.tweet,tweet.date_time AS dateTime
              from user natural join (follower inner join tweet on follower.following_user_id=tweet.user_id)
              where follower.follower_user_id=(select user.user_id from user where user.username='${request.username}')
              ORDER BY cast(strftime('%s',tweet.date_time) AS INTEGER) DESC LIMIT 4;`
  let res = await db.all(query)
  response.send(res)
})

app.get('/user/following/', checkToken, async (request, response) => {
  let query = `select user.name from user inner join follower on user.user_id = follower.following_user_id
               where follower.follower_user_id=(select user_id from user where username='${request.username}');`
  let res = await db.all(query)
  response.send(res)
})
app.get('/user/followers/', checkToken, async (request, response) => {
  let query = `select user.name from user inner join follower on user.user_id = follower.follower_user_id
               where follower.following_user_id=(select user_id from user where username='${request.username}');`
  let res = await db.all(query)
  response.send(res)
})
app.get(
  '/tweets/:tweetId/',
  checkToken,
  checkTweetId,
  async (request, response) => {
    let {tweetId} = request.params
    let q2 = `select 
              tweet.tweet as tweet,
              count(like.like_id) as likes,
              count(reply.reply_id) as replies,
              tweet.date_time as dateTime 
              from 
              (tweet inner join like ON tweet.tweet_id=like.tweet_id )
               natural join reply 
              where tweet.tweet_id = ${tweetId}
              group by tweet.tweet;`
    let res = await db.get(q2)
    response.send(res)
  },
)

app.get('/tweets/:tweetId/likes/', checkToken, async (request, response) => {
  let {tweetId} = request.params
  let q2 = `select user.username from 
             user inner join like 
             on user.user_id=like.user_id
             where like.tweet_id=${tweetId};
             `
  let res = await db.all(q2)
  let likes = []
  for (let ele of res) {
    likes.push(ele.username)
  }
  response.send({likes})
})

app.get('/tweets/:tweetId/replies/',
  checkToken,
  checkTweetId,
  async (request, response) => {
    let {tweetId} = request.params
    let query = `select user.name,reply.reply from user inner join reply
               on reply.user_id = user.user_id where reply.tweet_id = ${tweetId};`
    let res = await db.all(query)
    let replies = []
    for (let i of res) {
      replies.push(i)
    }
    response.send({replies})
  },
)
app.get('/user/tweets/', checkToken, async (request, response) => {
    let query = `SELECT 
    tweet.tweet,
    COUNT(DISTINCT like.like_id) AS likes,
    COUNT(DISTINCT reply.reply_id) AS replies,
    tweet.date_time AS dateTime
    FROM 
    tweet
    INNER JOIN user ON tweet.user_id = user.user_id
    LEFT JOIN like ON tweet.tweet_id = like.tweet_id
    LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
     WHERE 
    user.username = '${request.username}'
    group by tweet.tweet_id
     ;
     `
  let res = await db.all(query)
  response.send(res)
})

app.post('/user/tweets/', checkToken, async (request, response) => {
  let {tweet} = request.body
  let query = `INSERT INTO TWEET
               (tweet,user_id)
               VALUES 
               ('${tweet}',
                (select user_id from user where username='${request.username}'));`
  let res = await db.run(query)
  response.send('Created a Tweet')
})
app.delete('/tweets/:tweetId', checkToken, async (request, response) => {
  let {tweetId} = request.params
  let q1 = `select * from tweet where tweet_id=${tweetId} And user_id=(select user_id from user where username='${request.username}');`
  let r1 = await db.get(q1)
  if (r1 !== undefined) {
    let query = `DELETE FROM tweet WHERE tweet_id = ${tweetId};`
    let res = await db.run(query)
    response.send('Tweet Removed')
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})
module.exports = app
