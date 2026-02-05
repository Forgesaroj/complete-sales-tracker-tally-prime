# Complete Sales Tracker
## Web Application Integrated with Tally Prime

A comprehensive real-time sales tracking dashboard that integrates with Tally Prime for wholesale clothing businesses in Nepal. Track bills, receive payments, monitor inventory, and manage your entire sales workflow from a single web interface.

---

## Features

### Core Features
- **Real-time Bill Sync** - Bills appear within seconds of creation in Tally
- **One-Click Payment** - Receive payments from dashboard, auto-sync to Tally
- **Bill Status Tracking** - Track payment and dispatch status (Full Payment, Partial, Credit)
- **Sack/Bundle Tracking** - Track multi-vendor bags in single delivery
- **Columnar Daybook** - Party-wise debit/credit with balance

### New Features
- **Activity Log** - Track all payment changes with timestamps
- **Bill Inventory Sync** - View line items of each bill synced from Tally
- **Print Bills** - Print bills directly from the dashboard with inventory details
- **UDF Field Support** - Custom payment modes (Cash Teller 1/2, Cheque, QR Code, Discount, Bank Deposit, Esewa)

### User Experience
- **Mobile Friendly** - Responsive design, works on phones
- **Bilingual** - English & नेपाली

---

## Quick Start

### Prerequisites

1. **Tally Prime 7.0** running with HTTP server enabled
2. **Node.js 18+** installed
3. **Separate PC or same PC** on LAN for dashboard

### Step 1: Enable Tally HTTP Server

In Tally Prime:
```
F1 (Help) → Settings → Advanced Configuration
→ Enable "Allow External Applications to Access Tally": Yes
→ Set HTTP Server Port: 9000
→ Restart Tally
```

### Step 2: Create Dashboard Receipt Voucher Type

In Tally Prime:
```
Gateway of Tally → Create → Voucher Type
→ Name: Dashboard Receipt
→ Type of Voucher: Receipt
→ Save
```

### Step 3: Install & Configure Server

```bash
# Navigate to project folder
cd "/home/tsrjl/Desktop/Tally connector"

# Install server dependencies
cd server
npm install

# Copy and edit configuration
cp .env.example .env
```

Edit `.env` file:
```env
# Tally Prime Connection
TALLY_HOST=192.168.1.251   # IP of PC running Tally
TALLY_PORT=9000            # Tally HTTP port
TALLY_COMPANY=OME 82 to More
# Server
PORT=3000
HOST=0.0.0.0
```

### Step 4: Install & Build Client

```bash
cd ../client
npm install
npm run build
```

### Step 5: Start the Server

```bash
cd ../server
npm start
```

---

## Access Dashboard

After starting the server:

- **Local**: http://localhost:3000
- **LAN**: http://[server-ip]:3000

Open on any device connected to the same network.

---

## Development Mode

Run server and client separately for development:

**Terminal 1 - Server:**
```bash
cd server
npm run dev
```

**Terminal 2 - Client:**
```bash
cd client
npm run dev
```

Client will be available at http://localhost:5173

---

## Project Structure

```
Tally connector/
├── server/
│   ├── src/
│   │   ├── config/          # Configuration
│   │   ├── services/
│   │   │   ├── tallyConnector.js  # Tally XML communication
│   │   │   ├── database.js        # SQLite database
│   │   │   └── syncService.js     # Background sync
│   │   ├── routes/
│   │   │   └── api.js       # REST API endpoints
│   │   └── index.js         # Server entry point
│   ├── data/                # SQLite database files
│   └── .env                 # Configuration (create from .env.example)
│
├── client/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/           # Page components
│   │   ├── locales/         # Translations (en, ne)
│   │   ├── utils/           # API, socket, i18n
│   │   └── App.jsx          # Main app
│   └── dist/                # Production build
│
├── PROJECT_ROADMAP.md       # Detailed project documentation
└── README.md                # This file
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/dashboard/summary | Dashboard stats |
| GET | /api/bills | List bills |
| GET | /api/bills/pending | Pending payment bills |
| POST | /api/payments | Create payment (syncs to Tally) |
| GET | /api/daybook | Columnar daybook |
| GET | /api/sacks | List sacks |
| POST | /api/sacks | Create new sack |
| GET | /api/sync/status | Sync status |
| GET | /api/tally/status | Tally connection status |
| GET | /api/activity | Recent activity log |
| GET | /api/activity/today | Today's activities |
| GET | /api/activity/stats | Activity statistics |
| GET | /api/pending-sales-bills/:masterId/inventory | Get bill inventory items |
| POST | /api/pending-sales-bills/sync-inventory | Sync inventory from Tally |

---

## Troubleshooting

### Tally Not Connecting

1. Check Tally is running with HTTP server enabled
2. Verify firewall allows port 9000
3. Check TALLY_HOST in .env matches Tally PC IP
4. Try accessing http://[tally-ip]:9000 in browser

### Receipts Not Syncing to Tally

1. Verify "Dashboard Receipt" voucher type exists in Tally
2. Check Tally company name is correct in .env
3. Check server logs for XML errors

### Dashboard Not Loading

1. Ensure client is built: `cd client && npm run build`
2. Check server is running on correct port
3. Clear browser cache

---

## Default Login

```
Username: admin
Password: admin123
```

**Change this immediately after first login!**

---

## Support

For issues and feature requests, please document them in the PROJECT_ROADMAP.md file.

---

## Tech Stack

- **Backend**: Node.js, Express, Socket.io, SQLite
- **Frontend**: React, Vite, Tailwind CSS, i18next
- **Integration**: Tally XML over HTTP

---

---

## License

MIT License - Free to use and modify.

---

*Complete Sales Tracker - Built for wholesale businesses using Tally Prime in Nepal*
