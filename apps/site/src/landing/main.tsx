import { createRoot } from "react-dom/client";

import { ExampleTabs } from "./example-tabs";

let host = document.getElementById("examples");
if (host) {
  host.replaceChildren();
  createRoot(host).render(<ExampleTabs />);
}
