Ext.define("stories-by-portfolio-item-chart", {
    extend: 'Rally.app.App',
    componentCls: 'app',
    logger: new Rally.technicalservices.Logger(),
    defaults: { margin: 10 },

    config: {
        defaultSettings: {
            portfolioModelName: undefined,
            groupField: undefined,
            query: '(ScheduleState > "Completed")'
        }
    },

    integrationHeaders : {
        name : "stories-by-portfolio-item-chart"
    },
                        
    launch: function() {
        if (!this.getSetting('portfolioModelName')){
            this.add({
                xtype: 'container',
                html: 'Please configure a portfolio item type'
            });
            return;
        }
        this._launchApp(this.getSettings());

    },
    _launchApp: function(settings){
        this.logger.log('_launchApp',settings);

        this._fetchPortfolioItemData(settings).then({
            scope: this,
            success: this._addFilterComponents,
            failure: this._showError
        });
    },
    _showError: function(message){
        Rally.ui.notify.Notifier.showError({ message: message });
    },
    _fetchPortfolioItemData: function(settings){
        var deferred = Ext.create('Deft.Deferred'),
            storeConfigs = [{
                model: settings.portfolioModelName,
                fetch: ['ObjectID','FormattedID','Name','Children:summary[FormattedID]'],
                limit: 'Infinity',
                filters: [{
                        property: "LeafStoryCount",
                        operator: ">",
                        value: 0
                }]
            },{
                model: "PortfolioItem/ProjectorFeature",
                fetch: ['ObjectID','FormattedID','Parent','UserStories:summary[FormattedID]'],
                limit: 'Infinity',
                filters: [{
                    property: "LeafStoryCount",
                    operator: ">",
                    value: 0
                },{
                    property: "Parent",
                    operator: "!=",
                    value: ""
                }]
            }];

        this.logger.log('storeConfigs', storeConfigs);

        var promises = _.map(storeConfigs, function(storeConfig){ return this._fetchWsapiData(storeConfig); }, this);

            Deft.Promise.all(promises).then({
                success: function(results){
                      this.portfolioItemHash = results[0].reduce(function(hash, record){
                            hash[record.get('FormattedID')] = {Name: record.get('Name'), Children: record.get('Summary') && record.get('Summary').Children && _.keys(record.get('Summary').Children.FormattedID)};
                            return hash;
                      }, {});

                    var hash = results[0].reduce(function ( hash, record ) {
                          var children = record.get('Summary') && record.get('Summary').Children && _.keys(record.get('Summary').Children.FormattedID);
                          _.each(children, function(c){
                              hash[c] = record.get('FormattedID');
                          });
                          return hash;
                        }, {});

                    var ancestorHash = {};
                    _.each(results[1], function(f){
                        var parent = f.get('Parent') && f.get('Parent').FormattedID;

                        ancestorHash[f.get('FormattedID')] = hash[parent];
                    });
                    this.ancestorHash = ancestorHash;
                    deferred.resolve();
                },
                failure: function(message){
                    deferred.reject(message);
                },
                scope: this
            });
        return deferred;
    },
    _addFilterComponents: function(ancestorHash){

        this.removeAll();

        var endDate = new Date(),
            startDate = Rally.util.DateTime.add(endDate, 'month',-1);

        this.add({
            xtype: 'container',
            layout: 'hbox',
            items: [{
                xtype: 'rallydatefield',
                fieldLabel: 'Start Date',
                itemId: 'dt-start',
                labelAlign: 'right',
                value: startDate,
                listeners: {
                    change: this._updateData,
                    scope: this
                }
            },{
                xtype: 'rallydatefield',
                fieldLabel: 'End Date',
                itemId: 'dt-end',
                labelAlign: 'right',
                value: endDate,
                listeners: {
                    change: this._updateData,
                    scope: this
                }
            }]
        });
        this._updateData();
    },
    _getStartDate: function(){
        return this.down('#dt-start') && this.down('#dt-start').getValue() || Rally.util.DateTime.add(new Date(), 'month',-1);
    },
    _getEndDate: function(){
        return this.down('#dt-end') && this.down('#dt-end').getValue() || new Date();
    },
    _fetchWsapiData: function(config){
        var deferred = Ext.create('Deft.Deferred');

        Ext.create('Rally.data.wsapi.Store', config).load({
            callback: function(records, operation){
                this.logger.log('_fetchWsapiData', records, operation);
                if (operation.wasSuccessful()){
                    deferred.resolve(records);
                } else {
                    deferred.reject("Error fetching wsapi data: " + operation.error.errors.join(","));
                }
            },
            scope: this
        });
        return deferred;
    },
    _getGroupField: function(){
        this.logger.log('_getGroupField', this.getSetting('groupField'));
        return this.getSetting('groupField') || null;
    },
    _updateData: function(){
        this.logger.log('_updateData', this.ancestorHash, this.portfolioItemHash, this._getStartDate(), this._getEndDate());

        var featureName = this._getFeatureName(),
            filters = Ext.create('Rally.data.wsapi.Filter', {
                property: 'DirectChildrenCount',
                value: 0
            });
            filters = filters.and({
                property: 'ScheduleState',
                operator: '>',
                value: 'Completed'
            });
            filters = filters.and({
                property: 'AcceptedDate',
                operator: '>=',
                value: Rally.util.DateTime.toIsoString(this._getStartDate())
            });

            filters = filters.and({
                property: 'AcceptedDate',
                operator: '<=',
                value: Rally.util.DateTime.toIsoString(this._getEndDate())
            });

        var parentFilters = [{
            property: 'PortfolioItem',
            operator: '!=',
            value: "null"
        },{
            property: featureName,
            operator: '!=',
            value: "null"
        }];
        parentFilters = Rally.data.wsapi.Filter.or(parentFilters);

        filters = filters.and(parentFilters);
        this.logger.log('filters', filters.toString());

        var fetch = ['ObjectID','FormattedID','PortfolioItem',featureName];
        if (this._getGroupField()){
            fetch.push(this._getGroupField());
        }

        var storeConfig = {
            model: 'HierarchicalRequirement',
            fetch: fetch,
            filters: filters,
            limit: 'Infinity'
        };

        this._fetchWsapiData(storeConfig).then({
            success: this._buildChart,
            failure: this._showError,
            scope: this
        });


    },
    _buildChart: function(records){
        this.logger.log('_buildChart', records && records.length);

        if (this.down('rallychart')){
            this.down('rallychart').destroy();
        }

        var chartData = this._getChartData(records);

        this.add({
            xtype: 'rallychart',
            loadMask: false,
            chartData: chartData,
            chartConfig: this._getChartConfig(records, chartData.categories)
        });

    },
    _getFeatureName: function(){
        return "ProjectorFeature";
    },
    _getChartData: function(records){
        var dataHash = {},
            groupField = this._getGroupField(),
            featureName = this._getFeatureName(),
            groupFields = [],
            ancestorHash = this.ancestorHash;

        _.each(records, function(rec){
            var parent = rec.get('PortfolioItem') && rec.get('PortfolioItem').FormattedID || rec.get(featureName) && rec.get(featureName).FormattedID || null;
            console.log('parent', parent, ancestorHash[parent]);
            if (parent && ancestorHash[parent]){
                var ancestor = ancestorHash[parent];

                if (!dataHash[ancestor]){
                    dataHash[ancestor] = { total: 0 };
                }
                dataHash[ancestor].total++;

                if (groupField){
                    var val = rec.get(groupField) || "-- No Entry --";
                    if (Ext.isObject(val)){
                        val = val._refObjectName || val.Name;
                    }
                    if (!Ext.Array.contains(groupFields, val)){
                        groupFields.push(val);
                    }
                    dataHash[ancestor][val] = (dataHash[ancestor][val] || 0) + 1;
                }
            }
        }, this);


        var categories = _.map(dataHash, function(obj,key){ return this.portfolioItemHash[key] && this.portfolioItemHash[key].Name || "Unknown BU"; }, this),
            series = [];

        if (groupFields.length === 0){ groupFields.push('total'); }
        this.logger.log('_getChartData', dataHash, groupFields);

        _.each(groupFields, function(group){
            var seriesObj = {name: group, data: []};
            _.each(dataHash, function(obj){
                seriesObj.data.push(obj[group] || 0);
            }, this);
            series.push(seriesObj);
        }, this);

        this.logger.log('_getChartData', series, categories);

        return {
            categories: categories,
            series: series
        };
    },
    _getChartConfig: function(records, categories){
        var title = "Stories by Business Unit",
            groupField = this._getGroupField();
        if (groupField && records.length > 0){
            title = "Stories by " + records[0].getField(groupField).displayName + ' by Business Unit'
        }

        return {
            chart: {
                type: 'column'
            },
            title: {
                text: title
            },
            subtitle: {
                text: null
            },
            xAxis: {
                categories: categories
            },
            yAxis: {
                min: 0,
                title: {
                    text: 'Story Count'
                }
            },
            legend: {
                enabled:  (groupField !== null),
                align: 'right',
                layout: 'vertical',
                verticalAlign: 'top'
            },
            tooltip: {
                headerFormat: '<span style="font-size:10px">{point.key}</span><table>',
                pointFormat: '<tr><td style="color:{series.color};padding:0">{series.name}: </td>' +
                '<td style="padding:0"><b>{point.y:.1f} Stories</b></td></tr>',
                footerFormat: '</table>',
                shared: true,
                useHTML: true
            },
            plotOptions: {
                column: {
                    pointPadding: 0.2,
                    borderWidth: 0,
                    stacking: 'normal'
                }
            }
        };
    },

    getSettingsFields: function(){
        return Rally.technicalservices.Settings.getFields();
    },
    getOptions: function() {
        return [
            {
                text: 'About...',
                handler: this._launchInfo,
                scope: this
            }
        ];
    },
    
    _launchInfo: function() {
        if ( this.about_dialog ) { this.about_dialog.destroy(); }
        this.about_dialog = Ext.create('Rally.technicalservices.InfoLink',{});
    },
    
    isExternal: function(){
        return typeof(this.getAppId()) == 'undefined';
    },
    
    //onSettingsUpdate:  Override
    onSettingsUpdate: function (settings){
        this.logger.log('onSettingsUpdate',settings);
        this._launchApp(settings);
    }
});
