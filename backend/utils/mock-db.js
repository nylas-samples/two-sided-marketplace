const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

class MockDB {
  constructor(filename) {
    if (!filename) {
      throw new Error('Filename is required');
    }
    this.filename = filename;
    try {
      fs.accessSync(filename, fs.constants.R_OK | fs.constants.W_OK);
    } catch (err) {
      fs.writeFileSync(filename, '[]');
    }
  }

  async getJSONRecords() {
    // Read filecontents of the datastore
    const jsonRecords = await fs.promises.readFile(this.filename, {
      encoding: 'utf8',
    });
    // Parse JSON records in JavaScript
    return JSON.parse(jsonRecords);
  }

  // Logic to find data
  async findUser(id, emailAddress) {
    const jsonRecords = await this.getJSONRecords();
    return jsonRecords.find(
      (r) => r.emailAddress === emailAddress || r.id.toUpperCase() === id.toUpperCase()
    );
  }

  // Logic to find data
  async findProviders() {
    const jsonRecords = await this.getJSONRecords();
    return jsonRecords.filter(
      (r) => r.userType === 'provider'
    );
  }

  // Logic to update data
  async updateUser(id, payload) {
    const jsonRecords = await this.getJSONRecords();

    const idx = jsonRecords.findIndex((r) => r.id === id);
    if (idx === -1) {
      throw new Error('Record not found');
    }

    // Update existing record
    jsonRecords[idx] = { ...jsonRecords[idx], ...payload };

    await fs.promises.writeFile(
      this.filename,
      JSON.stringify(jsonRecords, null, 2)
    );
    return jsonRecords[idx];
  }

  // Logic to add data
  async createUser(id, payload) {
    const jsonRecords = await this.getJSONRecords();

    const user = {
      id,
      ...payload,
    };
    // Adding new record
    jsonRecords.push(user);

    // Writing all records back to the file
    await fs.promises.writeFile(
      this.filename,
      JSON.stringify(jsonRecords, null, 2)
    );

    return user;
  }

  // Logic to add or update data
  async createOrUpdateUser(id, attributes) {
    const record = await this.findUser(id, attributes?.emailAddress);
    if (record) {
      return await this.updateUser(record.id, attributes);
    } else {
      return await this.createUser(id, attributes);
    }
  }
}

const mockDB = new MockDB('datastore.json');

// 'datastore.json' is created at runtime
module.exports = mockDB;
