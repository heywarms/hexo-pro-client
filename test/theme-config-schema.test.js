const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const yaml = require('js-yaml');
const filename = path.resolve(__dirname, '../client/src/pages/theme-market/themeSchema.ts');
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = Module._nodeModulePaths(path.dirname(filename));
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText, filename);
const {getSchemaMetadataFromJson, generateSchemaFromYaml, updateYamlValues} = compiled.exports;

test('nested and list fields use translated schema labels with exact paths taking priority', () => {
  const schema = {'navigation':{label:'主导航'},'navigation.*.title':{label:'菜单标题'},'navigation.1.title':{label:'特定标题'}};
  assert.equal(getSchemaMetadataFromJson(schema, 'navigation.0.title').label, '菜单标题');
  assert.equal(getSchemaMetadataFromJson(schema, 'navigation.1.title').label, '特定标题');
  const groups = generateSchemaFromYaml({navigation:[{title:'首页',url:'/'}]}, '', {schemaJson:schema});
  assert.equal(groups[0].label, '主导航');
});

test('form saves keep false, empty and ordered arrays, nested objects and comments', () => {
  const original = '# 保留使用说明\nnavigation:\n  - title: 首页\n    url: /\nhome:\n  order: [hero, topics, about]\nfeatures:\n  search: true\n  code_copy: true\n';
  const result = updateYamlValues(original, {'navigation':[], 'home.order':['about','hero'], 'features':{search:false,code_copy:true}});
  assert.match(result, /# 保留使用说明/);
  assert.deepEqual(yaml.load(result), {navigation:[],home:{order:['about','hero']},features:{search:false,code_copy:true}});
});

test('scalar text round-trips without becoming YAML booleans, dates or numbers', () => {
  for (const value of ['false','true','null','42','2026-10-16',' leading space','a\nb','单引号\'与双引号"',': # []']) {
    assert.equal(yaml.load(updateYamlValues('brand: old\n', {brand:value})).brand, value);
  }
});
