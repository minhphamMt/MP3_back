import dns from "dns";

import app from "./app.js";
import { isSearchDocumentsEnabled } from "./services/search-document.service.js";
import { primeSearchIndex } from "./services/search-index.service.js";

dns.setDefaultResultOrder("ipv4first");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (!isSearchDocumentsEnabled()) {
    void primeSearchIndex("public");
  }
});
