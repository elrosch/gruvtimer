/// <reference path="../pb_data/types.d.ts" />

// gruvtimer schema.
//
// Every record belongs to one user. Records are created offline by the app under a
// client-generated id (15 chars, a-z0-9), deleted records stay as tombstones
// (`deleted = true`) and `updated` is the cursor clients pull changes with.

const OWN = '@request.auth.id != "" && user = @request.auth.id'
const KEEP_OWNER = '(@request.body.user:isset = false || @request.body.user = @request.auth.id)'

const PUZZLES = ['222', '333', '444', '555', '666', '777', 'clock', 'minx', 'pyram', 'skewb', 'sq1']

migrate((app) => {
  const users = app.findCollectionByNameOrId('users')

  const common = (name, fields) => new Collection({
    type: 'base',
    name,
    listRule: OWN,
    viewRule: OWN,
    createRule: OWN,
    updateRule: `${OWN} && ${KEEP_OWNER}`,
    deleteRule: OWN,
    fields: [
      { name: 'user', type: 'relation', required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      ...fields,
      { name: 'deleted', type: 'bool' },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [`CREATE INDEX idx_${name}_sync ON ${name} (user, updated)`],
  })

  app.save(common('solves', [
    { name: 'puzzle', type: 'select', required: true, maxSelect: 1, values: PUZZLES },
    { name: 'category', type: 'text', required: true, max: 100 },
    // raw timer value in ms, without penalty
    { name: 'time', type: 'number', required: true, onlyInt: true, min: 0 },
    { name: 'penalty', type: 'select', required: true, maxSelect: 1, values: ['none', '+2', 'dnf'] },
    { name: 'scramble', type: 'text', max: 2000 },
    { name: 'date', type: 'date', required: true },
    { name: 'comment', type: 'text', max: 2000 },
  ]))

  app.save(common('categories', [
    { name: 'puzzle', type: 'select', required: true, maxSelect: 1, values: PUZZLES },
    { name: 'name', type: 'text', required: true, max: 100 },
  ]))

  // the initial upload of a big solve history goes through the batch API
  const settings = app.settings()
  settings.batch.enabled = true
  settings.batch.maxRequests = 200
  settings.batch.timeout = 30
  app.save(settings)
}, (app) => {
  app.delete(app.findCollectionByNameOrId('solves'))
  app.delete(app.findCollectionByNameOrId('categories'))
})
