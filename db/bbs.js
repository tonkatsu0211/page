const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "bbs.db"));
db.pragma("journal_mode = WAL");

db.exec(`
create table if not exists boards(
  id integer primary key,
  slug text unique not null,
  title text not null
);
create table if not exists threads(
  id integer primary key,
  board_id integer not null,
  title text not null,
  created_at integer not null,
  updated_at integer not null,
  last_bump_at integer not null,
  is_archived integer not null default 0,
  foreign key(board_id) references boards(id)
);
create table if not exists posts(
  id integer primary key,
  thread_id integer not null,
  number integer not null,
  user text not null,
  color text,
  body text not null,
  created_at integer not null,
  foreign key(thread_id) references threads(id)
);
create index if not exists idx_threads_board on threads(board_id,last_bump_at desc);
create index if not exists idx_posts_thread on posts(thread_id,number);
`);

const countBoards = db.prepare("select count(*) c from boards").get().c;
if (!countBoards) {
  db.prepare("insert into boards(slug,title) values(?,?),(?,?)")
    .run("general","雑談","tech","技術");
}

module.exports = db;
