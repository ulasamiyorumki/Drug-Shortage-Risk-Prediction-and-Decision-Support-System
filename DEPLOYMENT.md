# Node 22 deployment

This application starts from `main.js` and is designed for a cPanel Node.js application.

## 1. Create the Node application

- Select Node.js **22**.
- Set the application root to the folder containing `main.js`.
- Set the startup file to **`main.js`**.
- Use the hosting-provided application URL.

## 2. Add environment variables

Add the following values in the Node.js application's environment-variable screen. Do not upload a `.env` file or put passwords in Git.

```text
DB_HOST=localhost
DB_PORT=3306
DB_NAME=your_database_name
DB_USER=your_database_user
DB_PASSWORD=your_database_password
GROQ_API_KEY=your_groq_key
PORT=3000
```

The database name shown in cPanel must be copied exactly. cPanel commonly uses underscores in database names; confirm the name in **MySQL Databases** before adding `DB_NAME`.

## 3. Install and prepare the database

After uploading the project, open the terminal associated with the Node application and run:

```bash
npm install
mysql -u DATABASE_USER -p DATABASE_NAME < database/schema.sql
npm run import:sqlite
```

`npm run import:sqlite` imports the existing `Datasets/drug_data.sqlite3` catalog to MySQL. It processes the catalog in batches of 500 records and can take several minutes.

## 4. Start or restart

Click **Restart** in cPanel's Node.js Selector after the dependency install and import finish.

## Background image

The interface already has a turquoise and blue glass background in CSS. If a background image is desired later, place it at `public/assets/background.webp` and update the `.backdrop` rule in `public/style.css` to use it.
