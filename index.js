const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");
const port = process.env.PORT || 4549;
const mongoURI = process.env.MONGO_URI;
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const secret_token = process.env.ACCESS_TOKEN_SECRET;

//app
const app = express();

//middlewares
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'https://bookify-library.netlify.app',
  ],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json());
app.use(cookieParser());

//mongo client
const client = new MongoClient(mongoURI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

//custom  middlewares
const verifyToken = (req,res,next) => {
  const token = req.cookies?.token;
  console.log(token);
  next()
}

const run = async () => {
  try {
    // await client.connect();
    const usersCollection = client.db('bookify').collection('users');

    //get user from db
    app.get('/users',verifyToken,async(req,res)=>{
      const result = await usersCollection.find().toArray();
      res.send(result)
    })
    //set user to db
    app.post('/users',async(req,res)=>{
      const user = req.body;
      const query = {email: user?.email}
      const isExist = await usersCollection.findOne(query);
      if(isExist){
        return res.status(401).send('Forbidden Access!')
      }
      const result = await usersCollection.insertOne(user)
      res.send(result)
    })

    //clear cookie when logout
    app.get('/logout',async(req,res)=>{
      res.clearCookie('token',{
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        maxAge: 0,
      }).send({success:true})
    })

    //auth with jwt
    app.post('/jwt',async(req,res)=>{
      const user = req.body;
      const token = jwt.sign(user,secret_token,{
        expiresIn: '24h'
      })
      res.cookie('token',token,{
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
      }).send({success: true})
    })

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
};

run().catch((error) => console.log);

app.get("/", (req, res) => {
  res.send({ server_status: "Server Running" });
});

app.listen(port, () => {
  console.log("Server Running On", port);
});
