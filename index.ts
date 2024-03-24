import admin from "firebase-admin";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import Stripe from "stripe";
dotenv.config();
const app = express();
const port = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const credentials = JSON.parse(process.env.FB_CREDENTIALS!);
admin.initializeApp({ credential: admin.credential.cert(credentials) });

const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_CLUSTER}.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
	serverApi: {
		deprecationErrors: true,
		version: ServerApiVersion.v1,
		strict: true,
	},
});

interface ReqVerify extends Request {
	uid?: string;
}

app.get("/", (req, res) => {
	res.redirect("https://gs-jerins-parlour-frontend.vercel.app/");
});

const run = async () => {
	try {
		// await client.connect();
		const bookingsColl = client
			.db("JerinsParlourDB")
			.collection("bookings");
		const reviewsColl = client.db("JerinsParlourDB").collection("reviews");
		const servicesColl = client
			.db("JerinsParlourDB")
			.collection("services");
		const usersColl = client.db("JerinsParlourDB").collection("users");

		//

		const verifyToken = async (
			req: ReqVerify,
			res: Response,
			next: NextFunction
		) => {
			if (!req.headers.authorization) {
				return res.status(401).send({ message: "unauthorized access" });
			}

			const token = req.headers.authorization.split(" ")[1];

			try {
				const decodedToken = await admin.auth().verifyIdToken(token);
				req.uid = decodedToken.uid;
				next();
			} catch (error) {
				return res.status(401).send({ message: "unauthorized access" });
			}
		};

		const verifyAdmin = async (
			req: ReqVerify,
			res: Response,
			next: NextFunction
		) => {
			const user = await usersColl.findOne({ uid: req.uid });

			if (!user || user.role !== "admin") {
				return res.status(403).send({ message: "forbidden access" });
			}

			next();
		};

		//

		app.get("/admin/:uid", verifyToken, async (req: ReqVerify, res) => {
			if (req.uid !== req.params.uid) {
				return res.status(403).send({ message: "forbidden access" });
			}

			const user = await usersColl.findOne({ uid: req.params.uid });
			const isAdmin = user && user.role === "admin" ? true : false;
			res.send({ isAdmin });
		});

		//

		app.post("/users", verifyToken, async (req, res) => {
			const { uid } = req.body;
			const update = { $set: req.body };
			const upsert = { upsert: true };
			const result = await usersColl.updateOne({ uid }, update, upsert);
			res.send(result);
		});

		//

		app.get("/reviews", async (req, res) => {
			const result = await reviewsColl.find().toArray();
			res.send(result);
		});

		app.get("/reviews/:uid", verifyToken, async (req, res) => {
			const { uid } = req.params;
			const result = await reviewsColl.findOne({ uid });
			res.send(result);
		});

		app.post("/reviews", verifyToken, async (req, res) => {
			const result = await reviewsColl.insertOne(req.body);
			res.send(result);
		});

		app.patch("/reviews/:uid", verifyToken, async (req, res) => {
			const { uid } = req.params;
			const update = { $set: req.body };
			const result = await reviewsColl.updateOne({ uid }, update);
			res.send(result);
		});

		//

		app.get("/services", verifyToken, async (req, res) => {
			const result = await servicesColl.find().toArray();
			res.send(result);
		});

		app.post("/services", verifyToken, verifyAdmin, async (req, res) => {
			const result = await servicesColl.insertOne(req.body);
			res.send(result);
		});

		app.patch(
			"/services/:id",
			verifyToken,
			verifyAdmin,
			async (req, res) => {
				const _id = new ObjectId(req.params.id);
				const update = { $set: req.body };
				const result = await servicesColl.updateOne({ _id }, update);
				res.send(result);
			}
		);

		app.delete(
			"/services/:id",
			verifyToken,
			verifyAdmin,
			async (req, res) => {
				const _id = new ObjectId(req.params.id);
				const result = await servicesColl.deleteOne({ _id });
				res.send(result);
			}
		);

		//

		app.get("/bookings/:uid", verifyToken, async (req, res) => {
			const { uid } = req.params;
			const result = await bookingsColl.find({ uid }).toArray();
			res.send(result);
		});

		app.get("/bookings", verifyToken, verifyAdmin, async (req, res) => {
			const result = await bookingsColl.find().toArray();
			res.send(result);
		});

		app.post("/create-payment-intent", verifyToken, async (req, res) => {
			const amount = req.body.price * 100;
			const payment_method_types = ["card"];
			const intent = { amount, currency: "usd", payment_method_types };
			const paymentIntent = await stripe.paymentIntents.create(intent);
			res.send({ clientSecret: paymentIntent.client_secret });
		});

		app.post("/payments", verifyToken, async (req, res) => {
			const result = await bookingsColl.insertOne(req.body);
			res.send(result);
		});

		app.patch(
			"/bookings/:id",
			verifyToken,
			verifyAdmin,
			async (req, res) => {
				const _id = new ObjectId(req.params.id);
				const update = { $set: req.body };
				const result = await bookingsColl.updateOne({ _id }, update);
				res.send(result);
			}
		);
	} finally {
		// await client.close();
	}
};

run().catch(console.dir);
app.listen(port, () => console.log(`Listening to port ${port}`));
