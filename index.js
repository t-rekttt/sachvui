let request = require('request-promise');
let cheerio = require('cheerio');
let fs = require('fs');
let mongoose = require('mongoose');
let model = require('./model.js');

let BASE_URL = 'https://sachvui.com';

let getCategories = async() => {
  let html = await request.get(BASE_URL);

  let $ = cheerio.load(html);

  return $('.cat-item').map((index, item) => {
    let el = $(item);

    return {
      name: el.text(),
      href: el.children('a').attr('href')
    };
  }).get();
}

let getMaxPagination = async(url) => {
  try {
    let html = await request.get(url);

    let $ = cheerio.load(html);

    let paginations = $('.pagination').find('a').map((index, item) => parseInt($(item).text())).get().filter(item => item);

    return paginations[paginations.length - 1];
  } catch (err) {
    return await getMaxPagination(url);
  }
}

let getBooksInfo = async(pageUrl) => {
  try {
    let html = await request.get(pageUrl);

    let $ = cheerio.load(html);

    return $('.ebook').map((index, book) => {
      let el = $(book);

      return {
        name: el.find('h5.tieude').text(),
        image: el.find('img').attr('src'),
        href: el.find('a').attr('href')
      }
    }).get();
  } catch (err) {
    return await getBooksInfo(pageUrl);
  }
}

let getBookContents = async(bookUrl) => {
  try {
    let html = await request.get(bookUrl);

    let $ = cheerio.load(html);

    let bookMeta = $('.thong_tin_ebook');

    let infos = bookMeta.find('h5');

    let [author, category, views] = [
      $(infos[0]).text().replace('Tác giả : ', ''),
      $(infos[1]).text().replace('Thể Loại : ', ''),
      $(infos[2]).text().replace('Lượt xem : ', '')
    ];

    let formats = bookMeta.find('.btn').map((index, btn) => {
      let el = $(btn);

      return {
        name: el.text().replace('Đọc ', ''),
        href: el.attr('href')
      };
    }).get();

    let introduction = $('.gioi_thieu_sach').text();

    let paginations = $('.pagination').find('a').map((index, item) => parseInt($(item).text())).get().filter(item => item);

    let maxPagination = (paginations && paginations.length) ? paginations[paginations.length - 1] : 1;

    let allChaptersInfo = [];

    for (let i = 1; i <= maxPagination; i++) {
      let chaptersInfo = await getChaptersInfo(`${bookUrl}/${i}`);

      allChaptersInfo = allChaptersInfo.concat(chaptersInfo);
    }

    for (let i = 0; i < allChaptersInfo.length; i++) {
      let chapter = await getChapter(allChaptersInfo[i].href);

      allChaptersInfo[i].content = chapter;
    }

    return {
      author,
      category,
      views,
      introduction,
      allChapters: allChaptersInfo,
      formats
    };
  } catch (err) {
    return await getBookContents(bookUrl);
  }
}

let getChapter = async(chapterUrl) => {
  try {
    let html = await request.get(chapterUrl);

    let $ = cheerio.load(html);

    return $('.doc-online p').map((index, paragraph) => $(paragraph).text()).get().join('\n\n');
  } catch (err) {
    return await getChapter(chapterUrl);
  }
}

let getChaptersInfo = async(bookPageUrl) => {
  try {
    let html = await request.get(bookPageUrl);

    let $ = cheerio.load(html);

    return $('#list-chapter').find('li').map((index, chapter) => {
      let el = $(chapter);

      return {
        name: el.text(),
        href: el.find('a').attr('href')
      };
    })
    .get()
    .filter(chapter => chapter.href && chapter.name);
  } catch (err) {
    return await getChaptersInfo(bookPageUrl);
  }
}

(async() => {
  await mongoose.connect('mongodb://localhost:27017/sachvui', {useNewUrlParser: true});
  console.log('DB connected');

  let categories = await getCategories();

  for (let i = 0; i < categories.length; i++) {
    console.log('Crawling category ' + categories[i].href);

    let categoryUrl = categories[i].href;

    let maxPage = await getMaxPagination(categoryUrl);

    console.log('Found max : ' + maxPage);

    for (let i = 1; i <= parseInt(maxPage); i++) {
      console.log('Crawling page ' + i);

      let booksInfo = await getBooksInfo(`${categoryUrl}/${i}`);

      await Promise.all(booksInfo.map(async book => {
        console.log('Crawling book ' + book.href);

        let bookContent = await getBookContents(book.href);

        return model.create({
          ...book,
          ...bookContent,
          category: categories[i]
        });
      }));
    }
  }

  // fs.writeFileSync('test.json', JSON.stringify(categories));
})();