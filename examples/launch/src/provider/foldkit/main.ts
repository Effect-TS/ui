import { Runtime } from "foldkit"
import { Drafts } from "../Drafts.ts"
import { init, Model, update, view } from "./app.ts"

const app = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  container: document.getElementById("root"),
  resources: Drafts.layer
})

Runtime.run(app)
