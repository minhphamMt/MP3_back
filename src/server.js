import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import app from "./app.js";

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
