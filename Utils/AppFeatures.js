class AppFeatures {
  constructor(queryString) {
    this.queryString = queryString;
    this.prismaQuery = {};
  }

  filter() {
    const queryObj = { ...this.queryString };
    const excludeQuery = ['page', 'sort', 'limit', 'fields'];
    excludeQuery.forEach(el => delete queryObj[el]);

    // Prisma filter operators
    const operatorMap = {
      gte: 'gte',
      gt: 'gt',
      lte: 'lte',
      lt: 'lt',
      ne: 'not',
    };

    this.prismaQuery.where = {};

    Object.keys(queryObj).forEach(key => {
      // Check for operator in value, e.g. price[gte]=100
      if (typeof queryObj[key] === 'object') {
        this.prismaQuery.where[key] = {};
        Object.keys(queryObj[key]).forEach(op => {
          if (operatorMap[op]) {
            this.prismaQuery.where[key][operatorMap[op]] = queryObj[key][op];
          }
        });
      } else {
        this.prismaQuery.where[key] = queryObj[key];
      }
    });

    return this;
  }

  sort() {
    if (this.queryString.sort) {
      const sortFields = this.queryString.sort.split(',').map(field => {
        if (field.startsWith('-')) {
          return { [field.substring(1)]: 'desc' };
        }
        return { [field]: 'asc' };
      });
      this.prismaQuery.orderBy = sortFields;
    } else {
      this.prismaQuery.orderBy = [{ created_at: 'desc' }];
    }
    return this;
  }

  limitFields() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(',');
      this.prismaQuery.select = {};
      fields.forEach(field => {
        this.prismaQuery.select[field] = true;
      });
    }
    // else: select all fields (default for Prisma)
    return this;
  }

  pagination() {
    const page = Math.abs(parseInt(this.queryString.page, 10)) || 1;
    const limit = Math.abs(parseInt(this.queryString.limit, 10)) || 10;
    const skip = (page - 1) * limit;
    this.prismaQuery.skip = skip;
    this.prismaQuery.take = limit;
    return this;
  }

  build() {
    return this.prismaQuery;
  }
}

module.exports = AppFeatures;