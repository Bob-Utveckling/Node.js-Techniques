require('dotenv').config()
var {dataModel} = require('./dataModelTemplate');
var uuid = require('./uuid')
var dbService = require ('./dbService')

const mysql = require("mysql");
const { hashSync, genSaltSync, compareSync } = require("bcrypt");

var express = require('express');
var session = require('express-session');
var FileStore = require('session-file-store')(session);

var app = express();
var bodyParser = require('body-parser')
var jsonParser = bodyParser.json() //create application/json parser
var urlencodedParser = bodyParser.urlencoded({extended: false}) //create application/x-www-form-urlencoded parser
//var urlencodedParser = bodyParser.urlencoded({extended: true})
app.use(bodyParser.json())
app.use(urlencodedParser);

const cors = require('cors');
app.set('trust proxy', 1) //(1) set for passing proxy and still getting right ip, apparently. https://stackoverflow.com/questions/8107856/how-to-determine-a-users-ip-address-in-node

//3 seconds
ThreeSec = 3000
TWO_HOURS = 1000 * 60 * 60 * 2
ThirtyMin = 1000 * 60 * 30
FiveSec = 1000 * 1 * 5


app.use(session({
    genid: function(req) {
        return uuid.create_UUID() // use UUIDs for session IDs
        //return genuuid() // use UUIDs for session IDs
    },
    store: new FileStore(),
    secret: 'keyboard cat',
    resave: false,
    rolling: true,
    saveUninitialized: true,
    cookie: { maxAge: ThirtyMin }
  }))

//did not work: origin: 'https://eduale.sharepoint.com'
app.use(cors({
    //origin: 'http://localhost:3000',
    origin: process.env.CORS_ORIGIN,
    //origin: '*',    
    credentials:true,
}));



app.post('/api/sessionID', async (req, res) => {
    console.log("./ session id: " + req.sessionID)  
    res.json({sessionID:req.sessionID})
})

const redirectLogin = (req, res, next) =>{
    if(!req.session.userId){
        console.log("- req.session.userId not exists. redirect to /login")
        res.redirect('/login')
    }else{
        next()
    }
}

const redirectHome = (req, res, next) =>{
    if(req.session.userId){
        console.log("- req.session.userId exists. redirecting to /home")
        res.redirect('/home')
    }else{
        next()
    }
}

app.get('/api/register', (req,res)=>{
    res.send(`
    <h1>Register</h1>
    <form method='post' action='/api/register'>
    <input type='text' name='firstName' placeholder='First Name' required />
    <input type='text' name='lastName' placeholder='Last Name' required />
    <input type='email' name='email' placeholder='Email' required />
    <input type='password' name='password' placeholder='password' required/>
    <input type='submit' />
    </form>
    <a href='/login'>Login</a>
    `)
})

app.post('/api/register', async (req, res, next)=>{
    try{
        const firstName = req.body.firstName;
        const lastName = req.body.lastName;
        const email = req.body.email;
        let password = req.body.password;
            if (!firstName || !lastName || !email || !password) {
                return res.sendStatus(400);
            }
        const salt = genSaltSync(10);
        password = hashSync(password, salt);
 
        const user =  await dbService.insertUser(firstName, lastName, email, password, "User").
                        then(insertId=>{
                            //return db.getUser(insertId);});
                            //req.session.userId = user.id
                            console.log("- added user with id: " + insertId)
                        })
        res.send("User registered")
        //return res.redirect('/register') 
 
    } catch(e){    
        console.log(e);
        res.sendStatus(400);
    }
});

app.get('/api/logout', redirectHome, async (req,res) => {
    console.log("\n - log out...")
    //not correct because not asnyc and res.json rnus first I think
    //but logs out anyway
    try {
        await dbService.deleteSession(req)
        .then(result=> {
            console.log("- result: " + result)
            res.json( {result:result, sessionID: req.sessionID})
        })
    } catch (e) {
        console.log("catch err: " + e)
    }   
})


app.get('/api/login', redirectHome, function(req,res) {
    res.send(`
        <h1>Login</h1>
        <form method='post' action='/api/login'>
        <input type='email' name='email' placeholder='Email' required />
        <input type='password' name='password' placeholder='password' required/>
        <input type='submit' />
        </form>`
    )
})

app.post('/api/login',redirectHome, async(req, res, next)=>{
    //res.header("Access-Control-Allow-Origin", "*");
    console.log("./login got: " + req.body.email + "," + req.body.password)
    console.log("- req.body = " + JSON.stringify(req.body));
    try{ 
        const email = req.body.email;
        const password = req.body.password;
        const clusterId = req.body.clusterId;
        user = await dbService.getUserByEmail(email);
        lastPublishMarkedDates = await dbService.getLastPublishSchedMarkedDates()
        pubId = await dbService.getLastPublishId()
        
        if(!user){
            dbService.deleteSession(req)
            return res.send({
                message: "User not OK",
                description: "Invalid email or password - Error 174"
            })
        }
    
        const isValidPassword = compareSync(password, user.password);
        //const isValidPassword = true;
        if(isValidPassword){
            user.password = undefined;
                dbService.userIdAndClusterIdHaveAssociations(clusterId, user.id).then(function(result) {
                    console.log("- result is: " + result)
                    //req.session.userId = user.id
                    console.log("- user login ok. session id: " + req.sessionID)
                    //delete old sessions if they exist or there was a log in, eg test with other username but same session id
                    dbService.deleteSession(req);
                    dbService.registerUserSession(
                        req.sessionID, 
                        //req.session.cookie.expires,
                        new Date().toLocaleString('en-US', {
                            timeZone: 'Europe/Stockholm' }),
                        user.firstname, user.lastname,
                        user.email, user.role, user.id,
                        clusterId
                    )
                    console.log("- Welcome " + user.firstname)
                    //dbService.getLastPublishId().then(function(lastPublishId) {
                        res.send({
                            message:"User OK",
                            sessionId: req.sessionID,
                            firstName: user.firstname,
                            role: user.role,
                            clusterId: clusterId,
                            lastPublishId: pubId, //0 //lastPublishId
                            lastPublishMarkedDates: lastPublishMarkedDates
                            //userRole: user.role
                        })
                    //}).catch(function(err) {console.log("err in getting lastPublishId: " + err)})
                }).catch(function(err) {
                    console.log(err)
                    res.json(
                        {   message:"User not OK",
                            description: "Invalid credentials - Error 209"
                        })

                })
        }  else{
            dbService.deleteSession(req)
            res.send(
            {   message:"User not OK",
                description: "Invalid email or password - Error 204"
            }
            );
            //return res.redirect('/login')
        } 
    } catch(e){
        console.log("- error in post /login: " + e);
        res.send({message:"error in post /login"})
    }
});

//there are 2 functions to check user session:
//one checks if user or admin has a session and returns the role
//one checks if user is registered AND admin and returns empty

async function isUserSessionInDBAndAdminOrUser(getSessionId, res, next) {
    console.log("- isUserSessionInDBAndAdminOrUser? -- session id: " + getSessionId)
    try {
        response = await dbService.getLoggedInSession(getSessionId)
        console.log("RESPONSE: " + JSON.stringify(response))
        if (response.role == "Admin" || response.role == "User") { 
            console.log("Admin Or User? true\n\n");
            //return true
            next(response.role);
        }
        else {
            console.log("Admin Or User? false\n\n");
            //return false
            //next(false);
            console.log("- Access to this resource denied")
            res.status(403).send({
                message:"Access Denied",
                description:"Access or action denied, please log in. Error 342"
            });
        }
    } catch (e) {
        //if (response=="session not found") {
        console.log("- err: " + e)
        //return false
        return res.status(403).send({
            message:"Access Denied",
            description:"Access or action denied, please log in. Error 242"
        });
    }
}

async function isUserSessionInDBAndAdmin(getSessionId, res, next) {
    console.log("- isUserSessionInDBAndAdmin? -- session id: " + getSessionId)
    try {
        response = await dbService.getLoggedInSession(getSessionId)
        console.log("RESPONSE: " + JSON.stringify(response))
        if (response.role == "Admin") { 
            console.log("Admin? true\n\n");
            //return true
            next();
        }
        else {
            console.log("Admin? false\n\n");
            //return false
            //next(false);
            console.log("- Access to this resource denied")
            res.status(403).send({
                message:"Access Denied",
                description:"Access or action denied, please log in. Error 278"
            });
        }
    } catch (e) {
        //if (response=="session not found") {
        console.log("- err: " + e)
        //return false
        return res.status(403).send({
            message:"Access Denied",
            description:"Access or action denied, please log in. Error 287"
        });
    }
}

app.get('/api', async (req, res) => {
    console.log("./ session id: " + req.sessionID)
    try {
        await isUserSessionInDBAndAdmin(req.sessionID, res, function() {
            res.send("<h1>Welcome!</h1>")
        })
    } catch(err) { console.log("did not complete request due to err. Error 263")}
    

    /*if (req.session.views) {
        console.log("- session id: " + req.sessionID);
        req.session.views++
        res.setHeader('Content-Type','text/html')
        res.write('<p>views: ' + req.session.views + '</p>')
        res.write('<p>expires in: ' + (req.session.cookie.maxAge/1000) + 's</p>')
        res.end()
    } else {
        req.session.views = 1
        res.end('wlecome to the session demo. refresh!')
    }*/
})



var server = app.listen(28416, function() {
    var host = server.address().address
    var port = server.address().port
    console.log("Node server app listening att http://%s:%s", host, port)
})