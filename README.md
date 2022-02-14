# micro_holdem

After building for the first time execute:
``
sudo docker exec -it users-db mongosh
``
and inside mongo client:
``
rs.initiate({_id: "rs0", members: [{_id: 0, host: "users-db:27017"},{_id: 1, host: "users-db-2:27017"},{_id: 2, host: "users-db-3:27017"}]})
``
Cards images, css and js used in project was from:
https://github.com/richardschneider/cardsJS