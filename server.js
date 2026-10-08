const config = require('./src/config');
const app = require('./src/app');

app.listen(config.port, () => {
  console.log(`Komaira Boutique is running at ${config.baseUrl}`);
  console.log(`Admin panel: ${config.baseUrl}/admin`);
});
