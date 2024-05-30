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
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    // console.log('token nei')
    return res.status(401).send({ message: "Forbidden Access!" });
  }
  jwt.verify(token, secret_token, (error, decoded) => {
    if (error) {
      // console.log('token nosto')
      return res.status(401).send({ message: "Forbidden Access!" });
    }
    req.user = decoded;
    next();
  });
};

//cookies options
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
};

const run = async () => {
  try {
    // await client.connect();
    const usersCollection = client.db("bookify").collection("users");
    const booksCollection = client.db("bookify").collection("books");
    const writersCollection = client.db("bookify").collection("writers");
    const featuredCollection = client.db("bookify").collection("featured");
    const reviewsCollection = client.db("bookify").collection("reviews");
    const borrowedBooksCollection = client
      .db("bookify")
      .collection("borrowed_books");
    const newsCollection = client.db("bookify").collection("news");

    //get user from db
    app.get("/users", async (req, res) => {
      let query = {};
      if(req.query.email){
        query = {
          email: { $ne: req.query.email },
        }
      }
    
      try {
        // Fetch users
        const users = await usersCollection.find(query).toArray();
    
        // Extract emails
        const userEmails = users.map(user => user.email);
    
        // Query borrowed books collection
        const borrowedBooks = await borrowedBooksCollection.find({
          user_email: { $in: userEmails }
        }).toArray();
    
        // Combine users with their borrowed books
        const usersWithBorrowedBooks = users.map(user => {
          const userBooks = borrowedBooks.filter(book => book.user_email === user.email);
          const bookNames = userBooks.map(book => book.book_name)
          return {
            ...user,
            bookNames
          };
        });
    
        res.send(usersWithBorrowedBooks);
      } catch (error) {
        console.error('Error fetching users or borrowed books:', error);
        res.status(500).send({ error: 'An error occurred while fetching data' });
      }
    });
    

    //get a single user
    app.get("/user/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });

    //get a single book
    app.get("/book/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await booksCollection.findOne(query);
      res.send(result);
    });

    app.get("/books", async (req, res) => {
      let query = {};
      try{
        const page = parseInt(req.query?.page) - 1;
        const size = parseInt(req.query?.size);
        if (req.query.writer) {
          query = { book_author: req.query.writer };
        }
        if (req.query.category) {
          query = { book_category: req.query.category };
        }
        if (req.query.search) {
          query = {
            book_name: { $regex: req.query.search || "", $options: "i" },
          };
        }
        if(req.query.available_books){
          query = { book_quantity: { $gt: 0 } }
        }
        const count = await booksCollection.countDocuments();
        const result = await booksCollection.find(query)
        .skip(page * size)
        .limit(size)
        .toArray();
        res.send({books: result,count:count});
      }
      catch(error){
        res.send({error: error})
      }
    });


    //dashboard stats
    app.get('/stats',async(req,res)=>{
      const book = await booksCollection.find().toArray();
      const user = await usersCollection.find().toArray();
      const borrowedBooks = await borrowedBooksCollection.find().toArray()

      const stats = {bookCount: book.length,user:user.length,borrowedBooksCount: borrowedBooks.length}
      res.send(stats)
    })

    //get reviews for a book
    app.get('/reviews',async(req,res)=>{
      let query = {}
      if(req.query.review){
        query = {bookId: req.query.review}
      }
      const result = await reviewsCollection.find(query).toArray();
      res.send(result)
    })

    //get borrowed book from db
    app.get("/borrowed_books/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req?.user?.email !== email) {
        return res.status(401).send({ message: "Forbidden" });
      }
      const query = { user_email: email };
      const result = await borrowedBooksCollection.find(query).toArray();
      res.send(result);
    });

    //get all featured books
    app.get("/featured_books", async (req, res) => {
      const result = await featuredCollection.find().toArray();
      res.send(result);
    });

    //get all available books
    app.get("/available_books", async (req, res) => {
      const filter = { book_quantity: { $gt: 0 } };
      const result = await booksCollection.find(filter).toArray();
      res.send(result);
    });

    //get news
    app.get("/news", async (req, res) => {
      const result = await newsCollection.find().toArray();
      res.send(result);
    });

    app.get("/writers", async (req, res) => {
      let query = {};
      if(req.query.name){
        query = {writer_name: req.query.name}
      }
      const result = await writersCollection.find(query).toArray();
      res.send(result);
    });

    //set a review to reviews
    app.post('/reviews',async(req,res)=>{
      const review = req.body;
      const result = await reviewsCollection.insertOne(review)
      res.send(result)
    })

    //set a book to db
    app.post("/books", verifyToken, async (req, res) => {
      const book = req.body;
      const role = req.user.role;
      const options = { upsert: true };
      if (role !== "librarian") {
        res.send({ access: false });
        return;
      }
      try {
        await writersCollection.findOneAndUpdate(
          { writer_name: book?.author_name },
          {
            $set: {writer_photo: book?.author_photo,writer_name: book?.book_author},
            $inc: { writer_book_count: 1 },
          },
          options
        );
        const result = await booksCollection.insertOne(book);
        res.send({ access: true, res: result });
      } catch (error) {
        res.status(500).send({
          success: false,
          message: "An error occurred while adding the book.",
        });
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

    //set borrowed book to db
    app.post("/borrowed_book/:name/:email", async (req, res) => {
      const borrowedBooks = req.body;
      const name = req.params.name;
      const email = req.params.email;
      const query = { book_name: name, user_email: email };
      const filter = { book_name: name };
      //check if book exist of not
      const isExist = await borrowedBooksCollection.findOne(query);
      if (isExist) {
        res.send({ message: "Already Borrowed This Book!" });
        return;
      }
      //check if user borrowed bok more than 3
      const search = { user_email: email };
      const checkLimit = await borrowedBooksCollection.find(search).toArray();
      if (checkLimit.length >= 3) {
        return res.send({ message: "Only 3 Book Can Borrowed!" });
      }
      //update quantity
      const updateQuantity = {
        $inc: {
          book_quantity: -1,
        },
      };
      await booksCollection.findOneAndUpdate(filter, updateQuantity);
      const result = await borrowedBooksCollection.insertOne(borrowedBooks);
      res.send({ message: "Successfully Added Book!" });
    });

    //update a book
    app.patch("/book/:id", verifyToken, async (req, res) => {
      const role = req?.user?.role;
      if (role !== "librarian") {
        return res.send({ access: false });
      }
      const id = req.params.id;
      const book = req.body;
      const query = { _id: new ObjectId(id) };
      const updatedBook = {
        $set: {
          book_name: book?.book_name,
          book_author: book?.book_author,
          book_category: book?.book_category,
          book_photo: book?.book_photo,
          book_rating: book?.book_rating,
        },
      };
      const result = await booksCollection.updateOne(query, updatedBook);
      res.send({ access: true, res: result });
    });

    //check role of user
    app.get("/user_role", verifyToken, (req, res) => {
      const role = req?.user?.role;
      if (role !== "librarian") {
        return res.send({ access: false });
      }
      res.send({ access: true });
    });

    //delete a book from borrowed book
    app.delete("/borrowed_book/:id/:name", async (req, res) => {
      const id = req.params.id;
      const name = req.params.name;
      //update that book stock
      const query = { book_name: name };
      const updateStock = {
        $inc: {
          book_quantity: 1,
        },
      };
      await booksCollection.findOneAndUpdate(query, updateStock);
      const filter = { _id: new ObjectId(id) };
      const result = await borrowedBooksCollection.deleteOne(filter);
      res.send(result);
    });


    //delete book from librarian
    app.delete('/book/:id',async(req,res)=>{
      const id = req.params.id
      const result = await booksCollection.deleteOne({_id: new ObjectId(id)})
      res.send(result)
    })
    app.delete('/user/:id',async(req,res)=>{
      const id = req.params.id
      const result = await usersCollection.deleteOne({_id: new ObjectId(id)})
      res.send(result)
    })

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
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
