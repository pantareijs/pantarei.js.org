
class PantareiRouter extends Pantarei.Element {

  static page_url (page_id) {
    return `/pages/${page_id}.html`
  }

  get container () {
    return this.refs.container
  }

  constructor () {
    super()
    this.router = page

    this.config = {}
    this.config.pages = {}
    this.config.menus = {}

    this._links = {}
    this._pages = {}
    this._current_page = null
    this._current_page_name = ''
    this._redirect_url = location.pathname || '/'

    this.register_pages(Pantarei.pages || [])
    this.register_menus(Pantarei.menus || [])
  }

  ready () {
    super.ready()
    this.redirect()
  }

  register_pages (pages) {
    pages.forEach(this.register_page, this)
  }

  register_page (page) {
    this.config.pages[page.name] = page
    this.router(page.link, (route) => {
      page.route = route
      this.open_page(page)
    })
  }

  register_menus (menus) {
    menus.forEach(this.register_menu, this)
  }

  register_menu (menu) {
    this.config.menus[menu.name] = menu
    menu.items.forEach((item) => {
      let page = this.config.pages[item.page]
      if (!page) {
        return
      }
      item.link = page.link
    })
  }

  _update_menus (menus) {

  }

  _update_menu (menu) {

  }

  get_menu (menu_name, page_name) {
    let menu = this.config.menus[menu_name]
    let items = menu.items
    let page = this.config.pages[page_name]
    let parent_page_name = page.parent

    items.forEach((item, index) => {
      if (item.page == page_name || item.page == parent_page_name) {
        menu.selected_item = index
      }
    })

    return menu
  }

  get_breadcrumbs (page_name) {
    let breadcrumbs = [page_name]
    return breadcrumbs
  }

  redirect () {
    let redirect_url = sessionStorage.getItem('redirect_url')
    if (redirect_url) {
      this._redirect_url = redirect_url
      sessionStorage.removeItem('redirect_url')
      this.router(this._redirect_url)
    } else {
      this.router()
    }
  }

  open_page (page_config) {
    let page_id = page_config.id
    let page_name = page_config.name

    if (this._current_page_name == page_name) {
      return
    }

    if (this._current_page) {
      this._current_page.remove()
      this._current_page = null
    }

    let data = Object.assign({}, Pantarei.data, page_config)
    data.config = this.config

    let menu_name = 'main'
    let menu = this.get_menu(menu_name, page_name)
    data.menu = menu

    let submenu_name = page_config.submenu
    if (submenu_name) {
      let submenu = this.get_menu(submenu_name, page_name)
      data.submenu = submenu
    }

    let breadcrumbs = this.get_breadcrumbs(page_name)
    data.breadcrumbs = breadcrumbs

    let layout = document.createElement(page_config.layout)
    this.container.appendChild(layout)
    layout.data = data

    let page_url = this.constructor.page_url(page_id)
    this.import_content(page_url)
      .then((content) => {
        layout.appendChild(content)
        this._current_page = layout
        this._current_page_name = page_name
        let path = '/' + page_config.route.pathname
        window.scrollTo(0, 0)
        window.ga && window.ga('send', 'pageview', path)
      })
      .catch((err) => {
        console.warn(err)
        this.router('/')
      })
  }

  import_content (href) {
    return new Promise((resolve, reject) => {
      fetch(href)
        .then((res) => {
          return res.text()
        })
        .then((html) => {
          let div = document.createElement('div')
          div.innerHTML = html
          let template = div.firstChild
          let content = template.content
          resolve(content)
        })
        .catch((err) => {
          console.log(err)
          reject(err)
        })
    })
  }

  import_html (href) {
    let link = this._links[href]
    if (link) {
      return link
    }

    return new Promise((resolve, reject) => {
      let link = document.createElement('link')
      link.rel = 'import'
      link.href = href

      link.onload = (event) => {
        this._links[href] = Promise.resolve(link)
        resolve(link)
      }
      link.onerror = (event) => {
        reject(link)
      }

      document.head.appendChild(link)
    })
  }

}

Pantarei.Router = PantareiRouter