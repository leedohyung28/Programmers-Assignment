const conn = require("../mariadb");
const { StatusCodes } = require("http-status-codes");
const jwt = require("jsonwebtoken");
const ensureAuthorization = require("../auth");

const selectBooks = (req, res) => {
  let totalBooksResponse = {};
  let { category_id, recentOneMonth, limit, currentPage } = req.query;

  // limit : page 당 도서 수
  // currentPage : 현재 페이지
  // offset : limit * (currentPage - 1)
  let offset = limit * (currentPage - 1);

  let sql = `SELECT SQL_CALC_FOUND_ROWS *, 
    (SELECT count(*) FROM likes WHERE liked_book_id=books.id) AS likes
     FROM books`;
  let values = [];

  if (category_id) {
    category_id = parseInt(category_id);
    sql += ` WHERE category_id = ?`;
    values.push(category_id);
  }
  if (recentOneMonth) {
    if (category_id) sql += " AND";
    else sql += " WHERE";

    sql += " published_at BETWEEN DATE_SUB(NOW(), INTERVAL 1 MONTH) AND NOW()";
  }

  sql += " LIMIT ? OFFSET ?";
  values.push(parseInt(limit), offset);
  conn.query(sql, values, function (err, results) {
    if (err) {
      console.log(err);
      return res.status(StatusCodes.BAD_REQUEST).end();
    }

    if (results.length) {
      results.map(function (result) {
        result.publishedAt = result.published_at;
        result.imageId = result.image_id;
        result.categoryId = result.category_id;

        delete result.published_at;
        delete result.image_id;
        delete result.category_id;
      });

      totalBooksResponse.books = results;
    } else return res.status(StatusCodes.NOT_FOUND).end();
  });

  sql = "SELECT found_rows()";

  conn.query(sql, function (err, results) {
    if (err) {
      console.log(err);
      return res.status(StatusCodes.BAD_REQUEST).end();
    }

    let pagination = {};
    pagination.currentPage = parseInt(currentPage);
    pagination.totalCount = results[0]["found_rows()"];

    totalBooksResponse.pagination = pagination;
    return res.status(StatusCodes.OK).json(totalBooksResponse);
  });
};

const selectSingleBook = (req, res) => {
  let decodedJwt = ensureAuthorization(req, res);

  if (decodedJwt instanceof jwt.TokenExpiredError) {
    return res.status(StatusCodes.UNAUTHORIZED).json({
      message: "로그인 세션이 만료되었습니다. 다시 로그인 하세요.",
    });
  } else if (decodedJwt instanceof jwt.JsonWebTokenError) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      message: "잘못된 토큰입니다.",
    });
  } else if (decodedJwt instanceof ReferenceError) {
    let { book_id } = req.params;
    book_id = parseInt(book_id);

    let sql = `SELECT *, 
        (SELECT count(*) FROM likes WHERE liked_book_id=books.id) AS likes
        FROM books 
        LEFT JOIN category 
        ON books.category_id = category.id 
        WHERE books.id = ?`;
    let values = [book_id];
    conn.query(sql, values, function (err, results) {
      if (err) {
        return res.status(StatusCodes.BAD_REQUEST).end();
      }

      if (results[0]) {
        res.status(StatusCodes.OK).json(results);
      } else {
        return res.status(StatusCodes.NOT_FOUND).end();
      }
    });
  } else {
    let { book_id } = req.params;
    book_id = parseInt(book_id);

    let sql = `SELECT *, 
        (SELECT count(*) FROM likes WHERE liked_book_id=books.id) AS likes,
        (SELECT EXISTS (SELECT * FROM likes WHERE reader_id=? AND liked_book_id=?)) AS liked
        FROM books 
        LEFT JOIN category 
        ON books.category_id = category.id 
        WHERE books.id = ?`;
    let values = [decodedJwt.id, book_id, book_id];
    conn.query(sql, values, function (err, results) {
      if (err) {
        return res.status(StatusCodes.BAD_REQUEST).end();
      }

      if (results[0]) {
        res.status(StatusCodes.OK).json(results);
      } else {
        return res.status(StatusCodes.NOT_FOUND).end();
      }
    });
  }
};

module.exports = {
  selectBooks,
  selectSingleBook,
};
