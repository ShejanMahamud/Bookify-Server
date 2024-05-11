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
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://bookify-library.netlify.app",
      "https://bookify-library-client.firebaseapp.com",
    ],
    credentials: true,
  })
);
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
  if(!token){
   return res.status(401).send({message: 'Forbidden Access!'})
  }
  jwt.verify(token,secret_token,(error,decoded)=>{
    if(error){
      return res.status(401).send({message: 'Forbidden Access!'})
    }
    req.user = decoded;
    next()
  })
}

//cookies options
const cookieOptions = {
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
};

const run = async () => {
  try {
    // await client.connect();
    const usersCollection = client.db("bookify").collection("users");
    const booksCollection = client.db("bookify").collection("books")
    //get user from db
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    //get a single user
    app.get('/user/:email',async(req,res)=>{
      const email = req.params.email;
      const query = {email: email};
      const result = await usersCollection.findOne(query);
      res.send(result)
    })

    //get a single book
    app.get('/book/:id',async(req,res)=>{
      const id = req.params.id;
      const query = {_id : new ObjectId(id)}
      const result = await booksCollection.findOne(query);
      res.send(result)
    })

    //set a book to db
    app.post('/books', verifyToken, async (req, res) => {
      const book = req.body;
      const role = req.user.role;
      if (role !== 'librarian') {
        res.send({ access: false});
        return;
      }
    
      try {
        const result = await booksCollection.insertOne(book);
        res.send({access: true,res: result});
      } catch (error) {
        res.status(500).send({ success: false, message: "An error occurred while adding the book." });
      }
    });
    

    //set user to db
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user?.email };
      const isExist = await usersCollection.findOne(query);
      if (isExist) {
        return res.status(401).send("Forbidden Access!");
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    //clearing Token
    app.post("/logout", async (req, res) => {
      const user = req.body;
      console.log("logging out", user);
      res
        .clearCookie("token", { ...cookieOptions, maxAge: 0 })
        .send({ success: true });
    });

    //auth with jwt
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, secret_token, {
        expiresIn: "24h",
      });
      res.cookie("token", token, cookieOptions).send({ success: true });
    });

    //update a book
    app.patch('/book/:id',verifyToken,async(req,res)=>{
      const role = req?.user?.role;
      if (role !== 'librarian') {
        return res.send({ access: false});
      }
      const id = req.params.id;
      const book = req.body;
      const query = {_id: new ObjectId(id)}
      const updatedBook = {
        $set: {
          book_name: book?.book_name,
          book_author: book?.book_author,
          book_category: book?.book_category,
          book_photo: book?.book_photo,
          book_rating: book?.book_rating
        }
      }
      const result = await booksCollection.updateOne(query,updatedBook);
      res.send({ access: true,res: result})
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
