import type { MigrationFn } from '../umzug';

/**
 * The schema exactly as provided in the challenge's `database.sql`.
 * Identifiers are intentionally unquoted so Postgres folds them to lowercase,
 * matching what the original script produces.
 */
export const up: MigrationFn = async ({ context: { sequelize } }) => {
  await sequelize.transaction(async (transaction) => {
    await sequelize.query(
      `CREATE TABLE users (
         id SERIAL PRIMARY KEY,
         email VARCHAR(255),
         accountNumber VARCHAR(20)
       )`,
      { transaction },
    );
    await sequelize.query(
      `CREATE TABLE instruments (
         id SERIAL PRIMARY KEY,
         ticker VARCHAR(10),
         name VARCHAR(255),
         type VARCHAR(10)
       )`,
      { transaction },
    );
    await sequelize.query(
      `CREATE TABLE orders (
         id SERIAL PRIMARY KEY,
         instrumentId INT,
         userId INT,
         size INT,
         price NUMERIC(10, 2),
         type VARCHAR(10),
         side VARCHAR(10),
         status VARCHAR(20),
         datetime TIMESTAMP,
         FOREIGN KEY (instrumentId) REFERENCES instruments(id),
         FOREIGN KEY (userId) REFERENCES users(id)
       )`,
      { transaction },
    );
    await sequelize.query(
      `CREATE TABLE marketdata (
         id SERIAL PRIMARY KEY,
         instrumentId INT,
         high NUMERIC(10, 2),
         low NUMERIC(10, 2),
         open NUMERIC(10, 2),
         close NUMERIC(10, 2),
         previousClose NUMERIC(10, 2),
         date DATE,
         FOREIGN KEY (instrumentId) REFERENCES instruments(id)
       )`,
      { transaction },
    );
  });
};

export const down: MigrationFn = async ({ context: { sequelize } }) => {
  await sequelize.query('DROP TABLE IF EXISTS marketdata, orders, instruments, users CASCADE');
};
