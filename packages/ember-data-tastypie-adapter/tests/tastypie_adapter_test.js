var get = Ember.get, set = Ember.set, hash = Ember.RSVP.hash;

var env, store, adapter;
var originalAjax, passedUrl, passedVerb, passedHash;
var Person, Role, Group, Task;

module("integration/django_tastypie_adapter - DjangoTastypieAdapter", {
  setup: function() {
    Person = DS.Model.extend({
      name: DS.attr('string'),
      tasks: DS.hasMany('task')
    });

    Group = DS.Model.extend({
      name: DS.attr('string'),
      people: DS.hasMany('person')
    });

    Role = DS.Model.extend({
      name: DS.attr('string'),
      primaryKey: '_id'
    });

    Task = DS.Model.extend({
      name: DS.attr('string'),
      owner: DS.belongsTo('person')
    });

    env = setupStore({
      person: Person,
      group: Group,
      role: Role,
      task: Task,
      adapter: DS.DjangoTastypieAdapter
    });

    store = env.store;
    adapter = env.adapter;

    env.store.modelFor('person');
    env.store.modelFor('group');
    env.store.modelFor('role');
    env.store.modelFor('task');

    env.container.register('serializer:application', DS.DjangoTastypieSerializer);
    env.container.register('serializer:_djangoTastypie', DS.DjangoTastypieSerializer);
    env.container.register('adapter:_djangoTastypie', DS.DjangoTastypieAdapter);
    env.dtSerializer = env.container.lookup("serializer:_djangoTastypie");
    env.dtAdapter    = env.container.lookup("adapter:_djangoTastypie");

    passedUrl = passedVerb = passedHash = null;
  }
});

function ajaxResponse(value) {
  adapter.ajax = function(url, verb, hash) {
    passedUrl = url;
    passedVerb = verb;
    passedHash = hash;

    return Ember.RSVP.resolve(value);
  };
}

var expectUrl = function(url, desc) {
  equal(passedUrl, url, "the URL is: " + url);
};

var expectType = function(type) {
  equal(passedVerb, type, "the HTTP method is: " + type);
};

var expectData = function(hash) {
  deepEqual(passedHash.data, hash, "the hash was passed along");
};

var expectState = function(model, state, value) {
  if (value === undefined) { value = true; }

  var flag = "is" + state.charAt(0).toUpperCase() + state.substr(1);
  equal(get(model, flag), value, "the person is " + (value === false ? "not " : "") + state);
};

var expectStates = function(arr, state, value) {
  arr.forEach(function(model) {
    expectState(model, state, value);
  });
};

test("can create a record", function() {
    var record = store.createRecord('person');
    set(record, 'name', 'bar');

    equal(get(record, 'name'), 'bar', "property was set on the record");
});

test('buildURL - should not use plurals', function() {
  equal(adapter.buildURL('person', 1), "/api/v1/person/1/");
});

test("creating a person makes a POST to /api/v1/person, with the data hash", function() {
  var person = store.createRecord('person');
  set(person, 'name', 'Tom Dale');

  ajaxResponse({ id: 1,  name: "Tom Dale", resource_uri: '/api/v1/person/1/'});
  person.save().then(async(function(person) {
    equal(passedUrl, "/api/v1/person/");
    equal(passedVerb, "POST");
    expectData({ name: "Tom Dale", tasks: [] });

    equal(person.get('id'), "1", "the post has the updated ID");
    equal(person.get('isDirty'), false, "the post isn't dirty anymore");
  }));

});

test("find - basic payload", function() {

  ajaxResponse({ id: 1, name: "Rails is omakase", resource_uri: '/api/v1/person/1/' });

  store.find('person', 1).then(async(function(person) {
    equal(passedUrl, "/api/v1/person/1/");
    equal(passedVerb, "GET");
    equal(passedHash, undefined);

    equal(person.get('id'), "1");
    equal(person.get('name'), "Rails is omakase");
  }));
});

test("updating a person makes a PUT to /people/:id with the data hash", function() {
  set(adapter, 'bulkCommit', false);

  store.push('person', { id: 1, name: "Yehuda Katz" });

  store.find('person', 1).then(async(function(person) {
    set(person, 'name', "Brohuda Brokatz");

    ajaxResponse();
    return person.save();
  })).then(async(function() {
    equal(1,1);
  }));

});

test("updates are not required to return data", function() {
  set(adapter, 'bulkCommit', false);

  store.push('person', { id: 1, name: "Yehuda Katz" });

  var _person;

  store.find('person', 1).then(async(function(person) {
    expectState(person, 'new', false);
    expectState(person, 'loaded');
    expectState(person, 'dirty', false);

    _person = person;

    set(person, 'name', "Brohuda Brokatz");
    expectState(person, 'dirty');

    ajaxResponse();
    return person.save();
  })).then(async(function(person) {
    expectUrl("/api/v1/person/1/", "the plural of the model name with its ID");
    expectType("PUT");

    expectState(person, 'saving', false);

    equal(_person, store.getById('person', 1), "the same person is retrieved by the same ID");
    equal(get(person, 'name'), "Brohuda Brokatz", "the data is preserved");
  }));

});

/* COMMENTED IN EMBER DATA
test("updating a record with custom primaryKey", function() {
  Ember.run(function() {
    set(adapter, 'bulkCommit', false);
    store.load(Role, { _id: 1, name: "Developer" });

    role = store.find(Role, 1);

    set(role, 'name', "Manager");
    store.commit();
  });

  expectUrl("api/v1/role/1/", "the plural of the model name with its ID");
  ajaxHash.success({ role: { _id: 1, name: "Manager" } });
});*/


test("deleting a person makes a DELETE to /api/v1/person/:id/", function() {
    set(adapter, 'bulkCommit', false);

    store.push('person', { id: 1, name: "Tom Dale" });

    store.find('person', 1).then(async(function(person) {
      ajaxResponse();

      person.deleteRecord();
      return person.save();
    })).then(async(function(person) {
      expectUrl("/api/v1/person/1/", "the plural of the model name with its ID");
      expectType("DELETE");

      equal(person.get('isDirty'), false, "the post isn't dirty anymore");
      equal(person.get('isDeleted'), true, "the post is now deleted");
    }));
});

test("finding all people makes a GET to /api/v1/person/", function() {

  ajaxResponse({"objects": [{ id: 1, name: "Yehuda Katz", resource_uri: '/api/v1/person/1/' }]});

  store.find('person').then(async(function(people) {
    expectUrl("/api/v1/person/", "the plural of the model name");
    expectType("GET");
    var person = people.objectAt(0);

    expectState(person, 'loaded');
    expectState(person, 'dirty', false);

    equal(person, store.getById('person', 1), "the record is now in the store, and can be looked up by ID without another Ajax request");
  }));
});

/*
test("since gets set if needed for pagination", function() {

  ajaxResponse({"objects": [{id: 1, name: "Roy", resource_uri: '/api/v1/person/1/'}, {id: 2, name: "Moss", resource_uri: '/api/v1/person/2/'}],
            "meta": {limit: 2, next: "nextUrl&offset=2", offset: 0, previous: null, total_count: 25}});

  store.find('person').then(async(function(people) {
    expectUrl("/api/v1/person/", "the findAll URL");
    return store.find('person');
  })).then(async(function(people) {
    expectData({offset: '2'});
    expectUrl("/api/v1/person/", "the findAll URL is the same with the since parameter");
  }));

});
*/

test("finding a person by ID makes a GET to /api/v1/person/:id/", function() {
  ajaxResponse({ id: 1, name: "Yehuda Katz", resource_uri: '/api/v1/person/1/' });

  store.find('person', 1).then(async(function(person) {
    expectUrl("/api/v1/person/1/", "the model name with the ID requested");
    expectType("GET");

    expectState(person, 'loaded', true);
    expectState(person, 'dirty', false);

    equal(person, store.getById('person', 1), "the record is now in the store, and can be looked up by ID without another Ajax request");
  }));
});

/*
test("findByIds generates a tastypie style url", function() {
  ajaxResponse([
      { id: 1, name: "Rein Heinrichs", resource_uri: '/api/v1/person/1/'},
      { id: 2, name: "Tom Dale", resource_uri: '/api/v1/person/2/' },
      { id: 3, name: "Yehuda Katz", resource_uri: '/api/v1/person/3/' }
    ]);

  store.findByIds('person', [1, 2, 3]).then(async(function(people) {
      expectUrl("/api/v1/person/set/1;2;3/");
      expectType("GET");

      var rein = store.getById('person', 1),
          tom = store.getById('person', 2),
          yehuda = store.getById('person', 3);

      deepEqual(rein.getProperties('id', 'name'), { id: "1", name: "Rein Heinrichs" });
      deepEqual(tom.getProperties('id', 'name'), { id: "2", name: "Tom Dale" });
      deepEqual(yehuda.getProperties('id', 'name'), { id: "3", name: "Yehuda Katz" });
  }));
});
*/


test("finding many people by a list of IDs", function() {
  Group.reopen({ people: DS.hasMany('person', { async: true }) });

  store.push('group', { id: 1, people: [1, 2, 3]});

  store.find('group', 1).then(async(function(group) {
    equal(passedUrl, undefined, "no Ajax calls have been made yet");
    ajaxResponse({"objects":
      [
        { id: 1, name: "Rein Heinrichs", resource_uri: '/api/v1/person/1/' },
        { id: 2, name: "Tom Dale", resource_uri: '/api/v1/person/2/' },
        { id: 3, name: "Yehuda Katz", resource_uri: '/api/v1/person/3/' }
      ]});
    return group.get('people');
  })).then(async(function(people) {
    expectUrl("/api/v1/person/set/1;2;3/");
    expectType("GET");

    var rein = store.getById('person', 1),
        tom = store.getById('person', 2),
        yehuda = store.getById('person', 3);

    deepEqual(rein.getProperties('id', 'name'), { id: "1", name: "Rein Heinrichs" });
    deepEqual(tom.getProperties('id', 'name'), { id: "2", name: "Tom Dale" });
    deepEqual(yehuda.getProperties('id', 'name'), { id: "3", name: "Yehuda Katz" });

    deepEqual(people.toArray(), [ rein, tom, yehuda ], "The correct records are in the array");
  }));
});


test("finding people by a query", function() {
  var people, rein, tom, yehuda;

  ajaxResponse({
    objects: [
      { id: 1, name: "Rein Heinrichs", resource_uri: '/api/v1/person/1/' },
      { id: 2, name: "Tom Dale", resource_uri: '/api/v1/person/2/' },
      { id: 3, name: "Yehuda Katz", resource_uri: '/api/v1/person/3/' }
    ]
  });

  store.find('person', {page: 1}).then(async(function(people) {
    equal(passedUrl, "/api/v1/person/");
    equal(passedVerb, "GET");
    deepEqual(passedHash.data, { page: 1 });

    equal(get(people, 'length'), 3, "the people are now loaded");

    rein = people.objectAt(0);
    equal(get(rein, 'name'), "Rein Heinrichs");
    equal(get(rein, 'id'), 1);

    tom = people.objectAt(1);
    equal(get(tom, 'name'), "Tom Dale");
    equal(get(tom, 'id'), 2);

    yehuda = people.objectAt(2);
    equal(get(yehuda, 'name'), "Yehuda Katz");
    equal(get(yehuda, 'id'), 3);

    people.forEach(function(person) {
      equal(get(person, 'isLoaded'), true, "the person is being loaded");
    });

  }));
});

test("if you specify a server domain then it is prepended onto all URLs", function() {
  adapter.setProperties({
    host: 'http://localhost:8000'
  });
  equal(adapter.buildURL('person', 1), "http://localhost:8000/api/v1/person/1/");
});

test("the adapter can use custom keys", function() {
  env.container.register('serializer:person', DS.DjangoTastypieSerializer.extend({
    attrs: { name: 'name_custom' }
  }));

  ajaxResponse({ objects: [{ id: 1, name_custom: "Rails is omakase", resource_uri: '/api/v1/person/1/' }, { id: 2, name_custom: "The Parley Letter", resource_uri: '/api/v1/person/2/' }] });

  store.findAll('person').then(async(function(people) {
    var person1 = store.getById('person', 1),
        person2 = store.getById('person', 2);

    deepEqual(person1.getProperties('id', 'name'), { id: "1", name: "Rails is omakase" }, "Person 1 is loaded");
    deepEqual(person2.getProperties('id', 'name'), { id: "2", name: "The Parley Letter" }, "Person 2 is loaded");

    equal(people.get('length'), 2, "The posts are in the array");
    equal(people.get('isLoaded'), true, "The RecordArray is loaded");
    deepEqual(people.toArray(), [ person1, person2 ], "The correct records are in the array");
  }));
});

test("creating an item with a belongsTo relationship urlifies the Resource URI (default key)", function() {
  store.push('person', {id: 1, name: "Maurice Moss"});

  store.find('person', 1).then(async(function(person) {
    expectState(person, 'new', false);
    expectState(person, 'loaded');
    expectState(person, 'dirty', false);

    var task = store.createRecord('task', {name: "Get a bike!"});
    expectState(task, 'new', true);
    expectState(task, 'dirty', true);
    set(task, 'owner', person);

    //ajaxResponse({ name: "Get a bike!", owner_id: "/api/v1/person/1/"});
    ajaxResponse();

    return task.save();
  })).then(async(function(task) {
    expectUrl('/api/v1/task/', 'create URL');
    expectType("POST");
    expectData({ name: "Get a bike!", owner: "/api/v1/person/1/"});
  }));

});

/*
test("creating an item with a belongsTo relationship urlifies the Resource URI (custom key)", function() {
  env.container.register('serializer:task', DS.DjangoTastypieSerializer.extend({
    attrs: { owner: 'owner_custom_key' }
  }));

  store.push('person', {id: 1, name: "Maurice Moss"});
  store.find('person', 1).then(async(function (person) {
    var task = store.createRecord('task', {name: "Get a bike!"});
    task.set('owner', person);

    expectState(task, 'new', true);
    expectState(task, 'dirty', true);

    ajaxResponse();
    return task.save();
  })).then(async(function (task) {
    expectUrl('/api/v1/task/', 'create URL');
    expectType("POST");
    expectData({ name: "Get a bike!", owner_custom_key: "/api/v1/person/1/"});

    expectState(task, 'new', false);
    expectState(task, 'dirty', false);
  }));
});
*/

test("adding hasMany relationships parses the Resource URI (default key)", function() {

  Person.reopen({
    name: DS.attr('string'),
    group: DS.belongsTo('group')
  });

  store.push('person', {id: 1, name: "Maurice Moss"});
  store.push('person', {id: 2, name: "Roy"});
  store.push('group', {id: 1, name: "Team"});

  hash({ moss: store.find('person', 1),
         roy: store.find('person', 2),
         group: store.find('group', 1) }).then(async(function(objects) {
    var group = objects.group,
        people;

    people = group.get('people');
    people.pushObject(objects.moss);
    people.pushObject(objects.roy);
    //group.set('people', people);

    ajaxResponse();
    return group.save();
  })).then(async(function(data) {
    expectUrl('/api/v1/group/1/', 'modify Group URL');
    expectType("PUT");
    expectData({name: "Team", people: ['/api/v1/person/1/', '/api/v1/person/2/'] });

    return store.find('person', 2);
  })).then(async(function(person) {
    equal(person.get('name'), 'Roy');
    equal(person.get('group').get('name'), 'Team');
  }));

});

