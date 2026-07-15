import "dotenv/config";
import { randomBytes, scryptSync } from "crypto";
import mysql from "mysql2/promise";

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const conn = await mysql.createConnection(process.env.DATABASE_URL);

async function upsertAccount(a) {
  const [rows] = await conn.execute("SELECT id FROM accounts WHERE email = ?", [
    a.email,
  ]);
  if (rows.length > 0) {
    console.log(`exists: ${a.email} (id ${rows[0].id})`);
    return rows[0].id;
  }
  const [res] = await conn.execute(
    `INSERT INTO accounts (role, name, email, phone, passwordHash, businessName, categories, city, rating)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      a.role,
      a.name,
      a.email,
      a.phone ?? null,
      hashPassword(a.password),
      a.businessName ?? null,
      a.categories ?? null,
      a.city ?? null,
      a.rating ?? "4.5",
    ]
  );
  console.log(`created: ${a.email} (id ${res.insertId})`);
  return res.insertId;
}

const buyerId = await upsertAccount({
  role: "buyer",
  name: "Demo Buyer",
  email: "user@demo.com",
  phone: "+91 98765 43210",
  password: "demo123",
});

const jewellerId = await upsertAccount({
  role: "jeweller",
  name: "Rajesh Verma",
  email: "jeweller@demo.com",
  phone: "+91 98765 11111",
  password: "demo123",
  businessName: "Verma Jewels",
  categories: "gold,diamond-gold,stone-studded",
  city: "Mumbai",
  rating: "4.8",
});

await upsertAccount({
  role: "admin",
  name: "VVServices Admin",
  email: "admin@vvservices.com",
  phone: "+91 90000 00000",
  password: "admin123",
});

// A couple of extra jewellers so the marketplace feels alive
const j2 = await upsertAccount({
  role: "jeweller",
  name: "Anita Shah",
  email: "anita@shahgold.com",
  phone: "+91 98222 33344",
  password: "demo123",
  businessName: "Shah Gold House",
  categories: "gold,diamond-gold",
  city: "Ahmedabad",
  rating: "4.6",
});

const j3 = await upsertAccount({
  role: "jeweller",
  name: "Karthik Iyer",
  email: "karthik@iyerdiamonds.com",
  phone: "+91 97111 22233",
  password: "demo123",
  businessName: "Iyer Diamonds",
  categories: "diamond-gold,stone-studded",
  city: "Chennai",
  rating: "4.9",
});

// Sample requests from the demo buyer (only if none exist yet)
const [existingReqs] = await conn.execute(
  "SELECT id FROM requests WHERE buyerId = ?",
  [buyerId]
);
if (existingReqs.length === 0) {
  const requests = [
    {
      title: "22K Gold Bridal Necklace Set",
      category: "gold",
      imageUrl:
        "https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=800&q=80",
      budgetMin: 150000,
      budgetMax: 250000,
      timeline: "1-2 months",
      notes:
        "Looking for a traditional bridal necklace set with matching earrings. Approx 60-70 grams. Antique finish preferred.",
    },
    {
      title: "Diamond Solitaire Engagement Ring",
      category: "diamond-gold",
      imageUrl:
        "https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=800&q=80",
      budgetMin: 80000,
      budgetMax: 120000,
      timeline: "2-4 weeks",
      notes: "1 carat solitaire, VS clarity, 18K white gold band, size 12.",
    },
    {
      title: "Emerald Stone-Studded Jhumkas",
      category: "stone-studded",
      imageUrl:
        "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=800&q=80",
      budgetMin: 40000,
      budgetMax: 60000,
      timeline: "1-2 weeks",
      notes: "Traditional jhumka design with green emeralds and pearl drops.",
    },
  ];
  const reqIds = [];
  for (const r of requests) {
    const [res] = await conn.execute(
      `INSERT INTO requests (buyerId, category, imageUrl, title, budgetMin, budgetMax, timeline, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
      [buyerId, r.category, r.imageUrl, r.title, r.budgetMin, r.budgetMax, r.timeline, r.notes]
    );
    reqIds.push(res.insertId);
    console.log(`request created: ${r.title} (id ${res.insertId})`);
  }

  // Sample quotes from the extra jewellers (leave demo jeweller free to quote live)
  const quotes = [
    {
      requestId: reqIds[0],
      jewellerId: j2,
      goldWeightGrams: "65.00",
      diamondWeightCarats: null,
      makingCharges: 22000,
      totalPrice: 218000,
      message:
        "We specialise in antique-finish bridal sets. Includes matching earrings and free lifetime polishing.",
    },
    {
      requestId: reqIds[1],
      jewellerId: j3,
      goldWeightGrams: "4.50",
      diamondWeightCarats: "1.00",
      makingCharges: 8000,
      totalPrice: 105000,
      message: "IGI-certified VS1 solitaire in 18K white gold. Ready in 3 weeks.",
    },
  ];
  for (const q of quotes) {
    const [res] = await conn.execute(
      `INSERT INTO quotes (requestId, jewellerId, goldWeightGrams, diamondWeightCarats, makingCharges, totalPrice, message, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        q.requestId,
        q.jewellerId,
        q.goldWeightGrams,
        q.diamondWeightCarats,
        q.makingCharges,
        q.totalPrice,
        q.message,
      ]
    );
    console.log(`quote created (id ${res.insertId})`);
    await conn.execute("UPDATE requests SET status = 'quoted' WHERE id = ?", [
      q.requestId,
    ]);
  }
} else {
  console.log("requests already seeded, skipping");
}

await conn.end();
console.log("Seed complete.");
