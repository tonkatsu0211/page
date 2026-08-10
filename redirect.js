const express = require("express");
const app = express();

app.get((req, res) => {
  res.redirect(`https://dnw22h-3000.csb.app${req.originalUrl}`);
});

const listener = app.listen(process.env.PORT, () => {
  console.log("App listening on port " + listener.address().port);
});
