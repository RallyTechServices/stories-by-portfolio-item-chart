Ext.define('Rally.technicalservices.Settings',{
    singleton: true,

    getFields: function(modelName){
        var labelWidth = 150;

        return [{
            xtype: 'tsfieldoptionscombobox',
            name: 'groupField',
            model: 'UserStory',
            noEntryText: '-- No Group Field --',
            labelWidth: labelWidth,
            labelAlign: 'right',
            fieldLabel: 'Group Field',
            multiSelect: true,
            allowNoEntry: true

        }];
    },
    fetchPortfolioItemTypes: function(){
        var deferred = Ext.create('Deft.Deferred');
        console.log('fetchPortfolioItemTypes', new Date());
        var store = Ext.create('Rally.data.wsapi.Store', {
            model: 'TypeDefinition',
            fetch: ['TypePath', 'Ordinal','Name'],
            filters: [
                {
                    property: 'Parent.Name',
                    operator: '=',
                    value: 'Portfolio Item'
                },
                {
                    property: 'Creatable',
                    operator: '=',
                    value: 'true'
                }
            ],
            sorters: [{
                property: 'Ordinal',
                direction: 'ASC'
            }]
        });
        store.load({
            callback: function(records, operation, success){
                console.log('fetchPortfolioItemTypes callback', new Date());
                if (success){
                    var portfolioItemTypes = new Array(records.length);
                    _.each(records, function(d){
                        //Use ordinal to make sure the lowest level portfolio item type is the first in the array.
                        var idx = Number(d.get('Ordinal'));
                        portfolioItemTypes[idx] = { typePath: d.get('TypePath'), name: d.get('Name') };
                    });
                    deferred.resolve(portfolioItemTypes);
                } else {
                    var error_msg = '';
                    if (operation && operation.error && operation.error.errors){
                        error_msg = operation.error.errors.join(',');
                    }
                    deferred.reject('Error loading Portfolio Item Types:  ' + error_msg);
                }
            }
        });
        return deferred.promise;
    }
});
