
export default class extends Pantarei.Component {

  async connected () {
    let section_id = this.context.params.section_id
    this.data.section = await this.action('fetch_section', section_id)
  }

}